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

    private func callModuleSyncUnmeasured(
        _ module: String,
        _ method: String,
        _ argsJSON: String
    ) -> String {
        do {
            let data = Data(argsJSON.utf8)
            let arguments = try JSONSerialization.jsonObject(with: data) as? [Any] ?? []
            let value = try modules.callSync(module: module, method: method, arguments: arguments)
            return encodeJSON(["ok": true, "value": value ?? NSNull()])
        } catch let error as StingNativeModuleError {
            var nativeError: [String: Any] = [
                "code": error.code,
                "message": error.message,
                "module": module,
                "method": method
            ]
            if let details = error.details { nativeError["details"] = details }
            return encodeJSON(["ok": false, "error": nativeError])
        } catch {
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
}
