import Foundation
import JavaScriptCore

@objc protocol StingJavaScriptBridgeExports: JSExport {
    func getRuntimeInfo() -> String
    func createElement(_ id: Int, _ type: String)
    func createTextNode(_ id: Int, _ value: String)
    func replaceText(_ id: Int, _ value: String)
    func setProperty(_ id: Int, _ name: String, _ valueJSON: String)
    func insertNode(_ parentId: Int, _ nodeId: Int, _ anchorId: Int)
    func removeNode(_ parentId: Int, _ nodeId: Int)
    func setEventEnabled(_ id: Int, _ event: String, _ enabled: Bool)
    func callModuleSync(_ module: String, _ method: String, _ argsJSON: String) -> String
    func callModuleAsync(_ module: String, _ method: String, _ argsJSON: String, _ requestId: Int)
    func setModuleEventEnabled(_ module: String, _ event: String, _ enabled: Bool) -> String
}

private struct StingModuleEventKey: Hashable {
    let module: String
    let event: String
}

struct StingBridgeMutationCounts: Equatable {
    var createElement = 0
    var createTextNode = 0
    var replaceText = 0
    var setProperty = 0
    var insertNode = 0
    var removeNode = 0
    var setEventEnabled = 0
}

final class StingJavaScriptBridge: NSObject, StingJavaScriptBridgeExports {
    private let nodes: StingNodeRegistry
    private let modules: StingModuleRegistry
    private let performanceDiagnostics: StingPerformanceDiagnostics?
    private let reportError: (Error) -> Void
    private let asyncLock = NSLock()
    private var activeAsyncRequestIds: Set<Int> = []
    private let moduleEventLock = NSLock()
    private var activeModuleEvents: Set<StingModuleEventKey> = []

    var asyncResultSink: ((Int, String) -> Void)?
    var moduleEventSink: ((String, String, String) -> Void)?
    private(set) var mutationCounts = StingBridgeMutationCounts()

    init(
        nodes: StingNodeRegistry,
        modules: StingModuleRegistry,
        performanceDiagnostics: StingPerformanceDiagnostics? = nil,
        reportError: @escaping (Error) -> Void
    ) {
        self.nodes = nodes
        self.modules = modules
        self.performanceDiagnostics = performanceDiagnostics
        self.reportError = reportError
    }

    func resetMutationCounts() {
        mutationCounts = StingBridgeMutationCounts()
    }

    func getRuntimeInfo() -> String {
        encodeJSON([
            "protocolVersion": 1,
            "platform": "ios",
            "modules": modules.versions()
        ])
    }

    func createElement(_ id: Int, _ type: String) {
        mutationCounts.createElement += 1
        perform(metric: "bridge.create-element") { try nodes.createElement(id: id, type: type) }
    }

    func createTextNode(_ id: Int, _ value: String) {
        mutationCounts.createTextNode += 1
        perform(metric: "bridge.create-text-node") { try nodes.createTextNode(id: id, value: value) }
    }

    func replaceText(_ id: Int, _ value: String) {
        mutationCounts.replaceText += 1
        perform(metric: "bridge.replace-text") { try nodes.replaceText(id: id, value: value) }
    }

    func setProperty(_ id: Int, _ name: String, _ valueJSON: String) {
        mutationCounts.setProperty += 1
        perform(metric: "bridge.set-property") {
            try nodes.setProperty(id: id, name: name, valueJSON: valueJSON)
        }
    }

    func insertNode(_ parentId: Int, _ nodeId: Int, _ anchorId: Int) {
        mutationCounts.insertNode += 1
        perform(metric: "bridge.insert-node") {
            try nodes.insertNode(parentId: parentId, nodeId: nodeId, anchorId: anchorId)
        }
    }

    func removeNode(_ parentId: Int, _ nodeId: Int) {
        mutationCounts.removeNode += 1
        perform(metric: "bridge.remove-node") {
            try nodes.removeNode(parentId: parentId, nodeId: nodeId)
        }
    }

    func setEventEnabled(_ id: Int, _ event: String, _ enabled: Bool) {
        mutationCounts.setEventEnabled += 1
        perform(metric: "bridge.set-event-enabled") {
            try nodes.setEventEnabled(id: id, event: event, enabled: enabled)
        }
    }

    func callModuleSync(_ module: String, _ method: String, _ argsJSON: String) -> String {
        if let performanceDiagnostics {
            return performanceDiagnostics.measure("bridge.call-module-sync") {
                callModuleSyncUnmeasured(module, method, argsJSON)
            }
        }
        return callModuleSyncUnmeasured(module, method, argsJSON)
    }

    func callModuleAsync(_ module: String, _ method: String, _ argsJSON: String, _ requestId: Int) {
        guard registerAsyncRequest(requestId) else {
            reportError(StingNativeModuleError(
                code: "E_DUPLICATE_REQUEST",
                message: "Asynchronous native request \(requestId) is already pending"
            ))
            return
        }

        let completionStart = performanceDiagnostics?.timestampNanoseconds()
        let dispatch = {
            do {
                let arguments = try self.decodeArguments(argsJSON)
                self.modules.callAsync(module: module, method: method, arguments: arguments) { [weak self] result in
                    self?.completeModuleAsync(
                        requestId: requestId,
                        module: module,
                        method: method,
                        result: result,
                        completionStart: completionStart
                    )
                }
            } catch {
                self.completeModuleAsync(
                    requestId: requestId,
                    module: module,
                    method: method,
                    result: .failure(error),
                    completionStart: completionStart
                )
            }
        }

        if let performanceDiagnostics {
            performanceDiagnostics.measure("bridge.call-module-async-dispatch", operation: dispatch)
        } else {
            dispatch()
        }
    }

    func setModuleEventEnabled(_ module: String, _ event: String, _ enabled: Bool) -> String {
        let key = StingModuleEventKey(module: module, event: event)

        do {
            if enabled {
                moduleEventLock.lock()
                let inserted = activeModuleEvents.insert(key).inserted
                moduleEventLock.unlock()

                if inserted {
                    do {
                        try modules.setEventEnabled(
                            module: module,
                            event: event,
                            enabled: true
                        ) { [weak self] payload in
                            self?.emitModuleEvent(key: key, payload: payload)
                        }
                    } catch {
                        moduleEventLock.lock()
                        activeModuleEvents.remove(key)
                        moduleEventLock.unlock()
                        throw error
                    }
                }
            } else {
                moduleEventLock.lock()
                let removed = activeModuleEvents.remove(key) != nil
                moduleEventLock.unlock()

                if removed {
                    try modules.setEventEnabled(
                        module: module,
                        event: event,
                        enabled: false,
                        emit: { _ in }
                    )
                }
            }

            return encodeJSON(["ok": true, "value": NSNull()])
        } catch {
            return encodeErrorResponse(error, module: module, method: "addListener:\(event)")
        }
    }

    func detachAsyncResultSink() {
        asyncResultSink = nil
        asyncLock.lock()
        activeAsyncRequestIds.removeAll(keepingCapacity: false)
        asyncLock.unlock()
    }

    func detachModuleEventSink() {
        moduleEventLock.lock()
        let observations = Array(activeModuleEvents)
        activeModuleEvents.removeAll(keepingCapacity: false)
        moduleEventSink = nil
        moduleEventLock.unlock()

        for key in observations {
            try? modules.setEventEnabled(
                module: key.module,
                event: key.event,
                enabled: false,
                emit: { _ in }
            )
        }
    }

    private func callModuleSyncUnmeasured(
        _ module: String,
        _ method: String,
        _ argsJSON: String
    ) -> String {
        do {
            let arguments = try decodeArguments(argsJSON)
            let value = try modules.callSync(module: module, method: method, arguments: arguments)
            return encodeJSON(["ok": true, "value": value ?? NSNull()])
        } catch {
            return encodeErrorResponse(error, module: module, method: method)
        }
    }

    private func completeModuleAsync(
        requestId: Int,
        module: String,
        method: String,
        result: Result<Any?, Error>,
        completionStart: UInt64?
    ) {
        guard claimAsyncRequest(requestId) else { return }

        let response: String
        switch result {
        case .success(let value):
            response = encodeJSON(["ok": true, "value": value ?? NSNull()])
        case .failure(let error):
            response = encodeErrorResponse(error, module: module, method: method)
        }

        let deliver = { [weak self] in
            guard let self else { return }
            self.asyncResultSink?(requestId, response)
            if let completionStart, let performanceDiagnostics = self.performanceDiagnostics {
                performanceDiagnostics.record(
                    "bridge.call-module-async-completion",
                    durationNanoseconds: performanceDiagnostics.elapsedNanoseconds(since: completionStart)
                )
            }
        }

        if Thread.isMainThread {
            deliver()
        } else {
            DispatchQueue.main.async(execute: deliver)
        }
    }

    private func emitModuleEvent(key: StingModuleEventKey, payload: Any?) {
        let payloadJSON = encodeJSONValue(payload)
        let deliver = { [weak self] in
            guard let self else { return }

            self.moduleEventLock.lock()
            let active = self.activeModuleEvents.contains(key)
            let sink = self.moduleEventSink
            self.moduleEventLock.unlock()

            guard active else { return }
            sink?(key.module, key.event, payloadJSON)
        }

        if Thread.isMainThread {
            deliver()
        } else {
            DispatchQueue.main.async(execute: deliver)
        }
    }

    private func registerAsyncRequest(_ requestId: Int) -> Bool {
        asyncLock.lock()
        defer { asyncLock.unlock() }
        return activeAsyncRequestIds.insert(requestId).inserted
    }

    private func claimAsyncRequest(_ requestId: Int) -> Bool {
        asyncLock.lock()
        defer { asyncLock.unlock() }
        return activeAsyncRequestIds.remove(requestId) != nil
    }

    private func decodeArguments(_ argsJSON: String) throws -> [Any] {
        let data = Data(argsJSON.utf8)
        return try JSONSerialization.jsonObject(with: data) as? [Any] ?? []
    }

    private func encodeErrorResponse(_ error: Error, module: String, method: String) -> String {
        if let error = error as? StingNativeModuleError {
            var nativeError: [String: Any] = [
                "code": error.code,
                "message": error.message,
                "module": module,
                "method": method
            ]
            if let details = error.details { nativeError["details"] = details }
            return encodeJSON(["ok": false, "error": nativeError])
        }

        return encodeJSON([
            "ok": false,
            "error": [
                "code": "E_NATIVE_CALL",
                "message": error.localizedDescription,
                "module": module,
                "method": method
            ]
        ])
    }

    private func perform(metric: String, _ operation: () throws -> Void) {
        do {
            if let performanceDiagnostics {
                try performanceDiagnostics.measure(metric, operation: operation)
            } else {
                try operation()
            }
        } catch {
            reportError(error)
        }
    }

    private func encodeJSON(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }

    private func encodeJSONValue(_ value: Any?) -> String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: value ?? NSNull(),
            options: [.fragmentsAllowed]
        ), let string = String(data: data, encoding: .utf8) else {
            return "null"
        }
        return string
    }
}
