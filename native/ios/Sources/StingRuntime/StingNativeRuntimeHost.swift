import Foundation
import UIKit

/// Engine-neutral owner of Sting's UIKit node tree and native-module registry.
///
/// JavaScript-engine adapters translate their embedding ABI into this object.
/// Application and module APIs remain engine-independent; this type exists to
/// keep renderer/module semantics authoritative in one Swift implementation.
public final class StingNativeRuntimeHost {
    public let performanceDiagnostics: StingPerformanceDiagnostics?

    private final class ErrorBox {
        private let lock = NSLock()
        private var error: Error?

        func reset() {
            lock.lock()
            error = nil
            lock.unlock()
        }

        func record(_ value: Error) {
            lock.lock()
            error = value
            lock.unlock()
        }

        func take() -> Error? {
            lock.lock()
            defer { lock.unlock() }
            let value = error
            error = nil
            return value
        }
    }

    private let nodes: StingNodeRegistry
    private let modules: StingModuleRegistry
    private let bridge: StingJavaScriptBridge
    private let errorBox: ErrorBox
    private var disposed = false

    public init(
        rootView: UIView,
        modules nativeModules: [any StingNativeModule] = [],
        collectPerformanceDiagnostics: Bool = false
    ) throws {
        let performanceDiagnostics = collectPerformanceDiagnostics
            ? StingPerformanceDiagnostics()
            : nil
        let nodes = StingNodeRegistry(rootView: rootView)
        let modules = try StingModuleRegistry(modules: nativeModules)
        let errorBox = ErrorBox()

        nodes.moduleViewFactory = { module, viewType in
            try modules.createView(module: module, type: viewType)
        }

        self.performanceDiagnostics = performanceDiagnostics
        self.nodes = nodes
        self.modules = modules
        self.errorBox = errorBox
        self.bridge = StingJavaScriptBridge(
            nodes: nodes,
            modules: modules,
            performanceDiagnostics: performanceDiagnostics,
            reportError: { error in
                errorBox.record(error)
            }
        )
    }

    public var asyncResultSink: ((Int, String) -> Void)? {
        get { bridge.asyncResultSink }
        set { bridge.asyncResultSink = newValue }
    }

    public var moduleEventSink: ((String, String, String) -> Void)? {
        get { bridge.moduleEventSink }
        set { bridge.moduleEventSink = newValue }
    }

    public var nodeEventSink: ((Int, String, String) -> Void)? {
        get { nodes.eventSink }
        set { nodes.eventSink = newValue }
    }

    public func getRuntimeInfo() -> String {
        bridge.getRuntimeInfo()
    }

    public func createElement(id: Int, type: String) throws {
        try perform { bridge.createElement(id, type) }
    }

    public func createTextNode(id: Int, value: String) throws {
        try perform { bridge.createTextNode(id, value) }
    }

    public func replaceText(id: Int, value: String) throws {
        try perform { bridge.replaceText(id, value) }
    }

    public func setProperty(id: Int, name: String, valueJSON: String) throws {
        try perform { bridge.setProperty(id, name, valueJSON) }
    }

    public func insertNode(parentId: Int, nodeId: Int, anchorId: Int) throws {
        try perform { bridge.insertNode(parentId, nodeId, anchorId) }
    }

    public func removeNode(parentId: Int, nodeId: Int) throws {
        try perform { bridge.removeNode(parentId, nodeId) }
    }

    public func setEventEnabled(id: Int, event: String, enabled: Bool) throws {
        try perform { bridge.setEventEnabled(id, event, enabled) }
    }

    public func callModuleSync(module: String, method: String, argsJSON: String) -> String {
        bridge.callModuleSync(module, method, argsJSON)
    }

    public func callModuleAsync(
        module: String,
        method: String,
        argsJSON: String,
        requestId: Int
    ) throws {
        try perform {
            bridge.callModuleAsync(module, method, argsJSON, requestId)
        }
    }

    public func setModuleEventEnabled(
        module: String,
        event: String,
        enabled: Bool
    ) -> String {
        bridge.setModuleEventEnabled(module, event, enabled)
    }

    /// Explicit platform-host lifecycle forwarding. UIKit application
    /// notifications are also observed by the registry, while this method is
    /// useful for custom host composition and deterministic tests.
    public func dispatchLifecycle(_ event: StingApplicationLifecycleEvent) {
        modules.dispatchLifecycle(event)
    }

    public func deliverBackgroundEvent(
        module: String,
        event: String,
        payload: Any?,
        completion: @escaping StingNativeModuleCompletion
    ) {
        modules.deliverBackgroundEvent(
            module: module,
            event: event,
            payload: payload,
            completion: completion
        )
    }

    public func detachAsyncResultSink() {
        bridge.detachAsyncResultSink()
    }

    public func detachModuleEventSink() {
        bridge.detachModuleEventSink()
    }

    /// Final native ownership cleanup after the JavaScript runtime has run its
    /// disposer. This is idempotent and deliberately separate from JS teardown
    /// so Solid can still issue normal removeNode operations while alive.
    public func disposeNativeOwnership() {
        guard !disposed else { return }
        disposed = true
        nodeEventSink = nil
        bridge.detachAsyncResultSink()
        bridge.detachModuleEventSink()

        // Modules see their terminal lifecycle callback before renderer-owned
        // module views and opaque native objects are retired.
        modules.dispatchLifecycle(.runtimeDisposing)
        nodes.dispose()
        modules.disposeAllObjects()
    }

    private func perform(_ operation: () -> Void) throws {
        errorBox.reset()
        operation()
        if let error = errorBox.take() {
            throw error
        }
    }
}
