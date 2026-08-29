import Darwin
import Foundation
import UIKit
import StingQuickJSABI
import StingRuntime

private final class StingQuickJSCallbackContext {
    let host: StingNativeRuntimeHost

    private let lock = NSLock()
    private var lastError: Error?

    init(host: StingNativeRuntimeHost) {
        self.host = host
    }

    func clearError() {
        lock.lock()
        lastError = nil
        lock.unlock()
    }

    func record(_ error: Error) {
        lock.lock()
        lastError = error
        lock.unlock()
    }

    func takeError() -> Error? {
        lock.lock()
        defer { lock.unlock() }
        let error = lastError
        lastError = nil
        return error
    }
}

private func stingQuickJSContext(
    _ raw: UnsafeMutableRawPointer?
) -> StingQuickJSCallbackContext? {
    guard let raw else { return nil }
    return Unmanaged<StingQuickJSCallbackContext>
        .fromOpaque(raw)
        .takeUnretainedValue()
}

private func stingQuickJSCopyCString(_ value: String) -> UnsafeMutablePointer<CChar>? {
    value.withCString { strdup($0) }
}

private func stingQuickJSReadString(
    _ value: UnsafePointer<CChar>?,
    name: String
) throws -> String {
    guard let value else {
        throw StingRuntimeError("QuickJS host callback is missing \(name)")
    }
    return String(cString: value)
}

private func stingQuickJSGetRuntimeInfo(
    _ raw: UnsafeMutableRawPointer?
) -> UnsafeMutablePointer<CChar>? {
    guard let context = stingQuickJSContext(raw) else { return nil }
    return stingQuickJSCopyCString(context.host.getRuntimeInfo())
}

private func stingQuickJSCreateElement(
    _ raw: UnsafeMutableRawPointer?,
    _ id: CInt,
    _ type: UnsafePointer<CChar>?
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.createElement(
            id: Int(id),
            type: try stingQuickJSReadString(type, name: "element type")
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSCreateTextNode(
    _ raw: UnsafeMutableRawPointer?,
    _ id: CInt,
    _ value: UnsafePointer<CChar>?
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.createTextNode(
            id: Int(id),
            value: try stingQuickJSReadString(value, name: "text value")
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSReplaceText(
    _ raw: UnsafeMutableRawPointer?,
    _ id: CInt,
    _ value: UnsafePointer<CChar>?
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.replaceText(
            id: Int(id),
            value: try stingQuickJSReadString(value, name: "text value")
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSSetProperty(
    _ raw: UnsafeMutableRawPointer?,
    _ id: CInt,
    _ name: UnsafePointer<CChar>?,
    _ valueJSON: UnsafePointer<CChar>?
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.setProperty(
            id: Int(id),
            name: try stingQuickJSReadString(name, name: "property name"),
            valueJSON: try stingQuickJSReadString(valueJSON, name: "property value")
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSInsertNode(
    _ raw: UnsafeMutableRawPointer?,
    _ parentId: CInt,
    _ nodeId: CInt,
    _ anchorId: CInt
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.insertNode(
            parentId: Int(parentId),
            nodeId: Int(nodeId),
            anchorId: Int(anchorId)
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSRemoveNode(
    _ raw: UnsafeMutableRawPointer?,
    _ parentId: CInt,
    _ nodeId: CInt
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.removeNode(parentId: Int(parentId), nodeId: Int(nodeId))
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSSetEventEnabled(
    _ raw: UnsafeMutableRawPointer?,
    _ id: CInt,
    _ event: UnsafePointer<CChar>?,
    _ enabled: CInt
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.setEventEnabled(
            id: Int(id),
            event: try stingQuickJSReadString(event, name: "event name"),
            enabled: enabled != 0
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSCallModuleSync(
    _ raw: UnsafeMutableRawPointer?,
    _ module: UnsafePointer<CChar>?,
    _ method: UnsafePointer<CChar>?,
    _ argsJSON: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>? {
    guard let context = stingQuickJSContext(raw) else { return nil }
    do {
        let response = context.host.callModuleSync(
            module: try stingQuickJSReadString(module, name: "module name"),
            method: try stingQuickJSReadString(method, name: "module method"),
            argsJSON: try stingQuickJSReadString(argsJSON, name: "module arguments")
        )
        return stingQuickJSCopyCString(response)
    } catch {
        context.record(error)
        return nil
    }
}

private func stingQuickJSCallModuleAsync(
    _ raw: UnsafeMutableRawPointer?,
    _ module: UnsafePointer<CChar>?,
    _ method: UnsafePointer<CChar>?,
    _ argsJSON: UnsafePointer<CChar>?,
    _ requestId: CInt
) -> CInt {
    guard let context = stingQuickJSContext(raw) else { return 0 }
    do {
        try context.host.callModuleAsync(
            module: try stingQuickJSReadString(module, name: "module name"),
            method: try stingQuickJSReadString(method, name: "module method"),
            argsJSON: try stingQuickJSReadString(argsJSON, name: "module arguments"),
            requestId: Int(requestId)
        )
        return 1
    } catch {
        context.record(error)
        return 0
    }
}

private func stingQuickJSSetModuleEventEnabled(
    _ raw: UnsafeMutableRawPointer?,
    _ module: UnsafePointer<CChar>?,
    _ event: UnsafePointer<CChar>?,
    _ enabled: CInt
) -> UnsafeMutablePointer<CChar>? {
    guard let context = stingQuickJSContext(raw) else { return nil }
    do {
        let response = context.host.setModuleEventEnabled(
            module: try stingQuickJSReadString(module, name: "module name"),
            event: try stingQuickJSReadString(event, name: "module event"),
            enabled: enabled != 0
        )
        return stingQuickJSCopyCString(response)
    } catch {
        context.record(error)
        return nil
    }
}

private func stingQuickJSReleaseString(
    _ raw: UnsafeMutableRawPointer?,
    _ value: UnsafeMutablePointer<CChar>?
) {
    _ = raw
    free(value)
}

/// Official QuickJS production runtime for Sting on iOS.
///
/// The public application surface remains the normal Sting/Solid API; this
/// class is owned by native host composition and does not expose engine values
/// or pointers to application JavaScript or native modules.
public final class StingQuickJSRuntime {
    public let performanceDiagnostics: StingPerformanceDiagnostics?
    public var runtimeErrorSink: ((Error) -> Void)?

    private let host: StingNativeRuntimeHost
    private let callbackContext: UnsafeMutableRawPointer
    private var handle: UnsafeMutableRawPointer?
    private var closed = false

    public init(
        rootView: UIView,
        modules nativeModules: [any StingNativeModule] = [],
        collectPerformanceDiagnostics: Bool = false
    ) throws {
        guard Thread.isMainThread else {
            throw StingRuntimeError("Official QuickJS iOS runtime must be created on the main thread")
        }

        let host = try StingNativeRuntimeHost(
            rootView: rootView,
            modules: nativeModules,
            collectPerformanceDiagnostics: collectPerformanceDiagnostics
        )
        let callbackContextValue = StingQuickJSCallbackContext(host: host)
        let callbackContext = Unmanaged.passRetained(callbackContextValue).toOpaque()

        self.host = host
        self.callbackContext = callbackContext
        self.performanceDiagnostics = host.performanceDiagnostics

        var callbacks = StingQuickJsAndroidHostCallbacks()
        callbacks.context = callbackContext
        callbacks.get_runtime_info = stingQuickJSGetRuntimeInfo
        callbacks.create_element = stingQuickJSCreateElement
        callbacks.create_text_node = stingQuickJSCreateTextNode
        callbacks.replace_text = stingQuickJSReplaceText
        callbacks.set_property = stingQuickJSSetProperty
        callbacks.insert_node = stingQuickJSInsertNode
        callbacks.remove_node = stingQuickJSRemoveNode
        callbacks.set_event_enabled = stingQuickJSSetEventEnabled
        callbacks.call_module_sync = stingQuickJSCallModuleSync
        callbacks.call_module_async = stingQuickJSCallModuleAsync
        callbacks.set_module_event_enabled = stingQuickJSSetModuleEventEnabled
        callbacks.release_string = stingQuickJSReleaseString

        guard let handle = sting_qjs_android_create(&callbacks) else {
            Unmanaged<StingQuickJSCallbackContext>.fromOpaque(callbackContext).release()
            throw StingRuntimeError("Unable to create the official QuickJS iOS runtime")
        }
        self.handle = handle

        host.asyncResultSink = { [weak self] requestId, responseJSON in
            self?.deliverModuleCompletion(requestId: requestId, responseJSON: responseJSON)
        }
        host.moduleEventSink = { [weak self] module, event, payloadJSON in
            self?.deliverModuleEvent(module: module, event: event, payloadJSON: payloadJSON)
        }
        host.nodeEventSink = { [weak self] nodeId, event, payloadJSON in
            self?.deliverNodeEvent(nodeId: nodeId, event: event, payloadJSON: payloadJSON)
        }
    }

    deinit {
        dispose()
    }

    public func evaluate(bundle: String, sourceURL: URL? = nil) throws {
        try requireOwnerThread("evaluate JavaScript")
        guard let handle, !closed else {
            throw StingRuntimeError("Cannot evaluate JavaScript after the Sting QuickJS runtime is disposed")
        }

        _ = sourceURL // QuickJS currently reports the stable sting-app.js source name.
        try withCallbackContext { context in
            context.clearError()
            let error = bundle.withCString { source in
                sting_qjs_android_evaluate(handle, source, bundle.utf8.count)
            }
            try throwIfEngineError(error, context: context, operation: "evaluation")
        }
    }

    /// Forward a native back gesture/button into the deepest active NavigationStack.
    public func requestBack() throws -> Bool {
        try requireOwnerThread("handle a native back request")
        guard handle != nil, !closed else { return false }
        return host.requestBack()
    }

    public func close() throws {
        if Thread.isMainThread {
            try closeOnOwnerThread()
            return
        }

        var result: Result<Void, Error>!
        DispatchQueue.main.sync {
            result = Result { try self.closeOnOwnerThread() }
        }
        try result.get()
    }

    public func dispose() {
        try? close()
    }

    private func closeOnOwnerThread() throws {
        guard !closed else { return }
        closed = true
        guard let current = handle else { return }
        handle = nil

        host.detachAsyncResultSink()
        host.detachModuleEventSink()
        host.nodeEventSink = nil

        var disposeFailure: Error?
        withCallbackContext { context in
            context.clearError()
            let error = sting_qjs_android_dispose_runtime(current)
            do {
                try throwIfEngineError(error, context: context, operation: "runtime disposal")
            } catch {
                disposeFailure = error
            }
        }

        // JavaScript/Solid ownership has now had its chance to detach the tree.
        // Final native view/object cleanup is deliberately after JS teardown.
        host.disposeNativeOwnership()
        sting_qjs_android_destroy(current)
        Unmanaged<StingQuickJSCallbackContext>.fromOpaque(callbackContext).release()

        if let disposeFailure { throw disposeFailure }
    }

    private func deliverNodeEvent(nodeId: Int, event: String, payloadJSON: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.deliverNodeEvent(nodeId: nodeId, event: event, payloadJSON: payloadJSON)
            }
            return
        }
        guard let current = handle, !closed else { return }

        withCallbackContext { context in
            context.clearError()
            let error = event.withCString { eventValue in
                payloadJSON.withCString { payloadValue in
                    sting_qjs_android_dispatch_event(
                        current,
                        CInt(nodeId),
                        eventValue,
                        payloadValue
                    )
                }
            }
            reportAsyncEngineError(error, context: context, operation: "node event dispatch")
        }
    }

    private func deliverModuleCompletion(requestId: Int, responseJSON: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.deliverModuleCompletion(requestId: requestId, responseJSON: responseJSON)
            }
            return
        }
        guard let current = handle, !closed else { return }

        withCallbackContext { context in
            context.clearError()
            let error = responseJSON.withCString { response in
                sting_qjs_android_complete_module_call(current, CInt(requestId), response)
            }
            reportAsyncEngineError(error, context: context, operation: "async module completion")
        }
    }

    private func deliverModuleEvent(module: String, event: String, payloadJSON: String) {
        // StingJavaScriptBridge already queues native module emissions onto the
        // main runtime thread and re-checks active observation before invoking
        // this sink. Keep this method owner-thread-only before QuickJS entry.
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.deliverModuleEvent(module: module, event: event, payloadJSON: payloadJSON)
            }
            return
        }
        guard let current = handle, !closed else { return }

        withCallbackContext { context in
            context.clearError()
            let error = module.withCString { moduleValue in
                event.withCString { eventValue in
                    payloadJSON.withCString { payloadValue in
                        sting_qjs_android_dispatch_module_event(
                            current,
                            moduleValue,
                            eventValue,
                            payloadValue
                        )
                    }
                }
            }
            reportAsyncEngineError(error, context: context, operation: "module event dispatch")
        }
    }

    private func reportAsyncEngineError(
        _ error: UnsafeMutablePointer<CChar>?,
        context: StingQuickJSCallbackContext,
        operation: String
    ) {
        do {
            try throwIfEngineError(error, context: context, operation: operation)
        } catch {
            runtimeErrorSink?(error)
        }
    }

    private func throwIfEngineError(
        _ error: UnsafeMutablePointer<CChar>?,
        context: StingQuickJSCallbackContext,
        operation: String
    ) throws {
        guard let error else {
            if let hostError = context.takeError() {
                throw hostError
            }
            return
        }

        let engineMessage = String(cString: error)
        sting_qjs_android_free_error(error)

        if let hostError = context.takeError() {
            throw StingRuntimeError(
                "Official QuickJS \(operation) failed: \(hostError.localizedDescription) [\(engineMessage)]"
            )
        }
        throw StingRuntimeError("Official QuickJS \(operation) failed: \(engineMessage)")
    }

    private func withCallbackContext<T>(
        _ operation: (StingQuickJSCallbackContext) throws -> T
    ) rethrows -> T {
        let context = Unmanaged<StingQuickJSCallbackContext>
            .fromOpaque(callbackContext)
            .takeUnretainedValue()
        return try operation(context)
    }

    private func requireOwnerThread(_ operation: String) throws {
        guard Thread.isMainThread else {
            throw StingRuntimeError(
                "Official QuickJS iOS runtime must \(operation) on the main thread that owns UIKit"
            )
        }
    }
}
