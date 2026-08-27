import Foundation
import JavaScriptCore
import UIKit

public final class StingJavaScriptRuntime {
    public let context: JSContext
    public let performanceDiagnostics: StingPerformanceDiagnostics?

    private let nodes: StingNodeRegistry
    private let modules: StingModuleRegistry
    private var bridge: StingJavaScriptBridge?
    private var lastException: String?
    private var disposed = false

    public init(
        rootView: UIView,
        modules nativeModules: [any StingNativeModule] = [],
        collectPerformanceDiagnostics: Bool = false
    ) throws {
        guard let context = JSContext() else {
            throw StingRuntimeError("Unable to create JavaScriptCore context")
        }

        self.context = context
        self.performanceDiagnostics = collectPerformanceDiagnostics
            ? StingPerformanceDiagnostics()
            : nil
        self.nodes = StingNodeRegistry(rootView: rootView)
        self.modules = try StingModuleRegistry(modules: nativeModules)

        context.exceptionHandler = { [weak self] _, exception in
            self?.lastException = exception?.toString() ?? "Unknown JavaScript exception"
        }

        installHostGlobals(in: context)
        if let lastException {
            throw StingRuntimeError(lastException)
        }

        let bridge = StingJavaScriptBridge(
            nodes: nodes,
            modules: modules,
            performanceDiagnostics: performanceDiagnostics,
            reportError: { [weak context] error in
                context?.exception = JSValue(newErrorFromMessage: error.localizedDescription, in: context)
            }
        )
        self.bridge = bridge
        context.setObject(bridge, forKeyedSubscript: "__stingNativeBridge" as NSString)

        bridge.asyncResultSink = { [weak context] requestId, responseJSON in
            guard let context,
                  let resolver = context.objectForKeyedSubscript("__stingResolveModuleCall"),
                  !resolver.isUndefined else {
                return
            }
            resolver.call(withArguments: [requestId, responseJSON])
        }

        bridge.moduleEventSink = { [weak context] module, event, payloadJSON in
            guard let context,
                  let dispatch = context.objectForKeyedSubscript("__stingDispatchModuleEvent"),
                  !dispatch.isUndefined else {
                return
            }
            dispatch.call(withArguments: [module, event, payloadJSON])
        }

        let performanceDiagnostics = self.performanceDiagnostics
        nodes.eventSink = { [weak context, weak performanceDiagnostics] nodeId, event, payloadJSON in
            let dispatch = {
                context?.objectForKeyedSubscript("__stingDispatchEvent")?.call(
                    withArguments: [nodeId, event, payloadJSON]
                )
            }

            if let performanceDiagnostics {
                performanceDiagnostics.measure("event.\(event)-round-trip", operation: dispatch)
            } else {
                dispatch()
            }
        }
    }

    deinit {
        dispose()
    }

    public func evaluate(bundle: String, sourceURL: URL? = nil) throws {
        guard !disposed else {
            throw StingRuntimeError("Cannot evaluate JavaScript after the Sting runtime is disposed")
        }

        lastException = nil

        let evaluateBundle = {
            if let sourceURL {
                self.context.evaluateScript(bundle, withSourceURL: sourceURL)
            } else {
                self.context.evaluateScript(bundle)
            }
        }

        if let performanceDiagnostics {
            performanceDiagnostics.measure("runtime.bundle-evaluate", operation: evaluateBundle)
        } else {
            evaluateBundle()
        }

        if let lastException {
            throw StingRuntimeError(lastException)
        }
    }

    public func dispose() {
        if Thread.isMainThread {
            disposeOnRuntimeThread()
        } else {
            DispatchQueue.main.sync { [weak self] in
                self?.disposeOnRuntimeThread()
            }
        }
    }

    // Internal diagnostics used by native integration tests and benchmark
    // harnesses. These deliberately stay out of the public Sting application
    // API while allowing us to verify fine-grained renderer behavior at the
    // production JavaScript -> native bridge boundary.
    func resetMutationCounts() {
        bridge?.resetMutationCounts()
    }

    var mutationCounts: StingBridgeMutationCounts {
        bridge?.mutationCounts ?? StingBridgeMutationCounts()
    }

    private func disposeOnRuntimeThread() {
        guard !disposed else { return }
        disposed = true

        if let disposeRuntime = context.objectForKeyedSubscript("__stingDisposeRuntime"),
           !disposeRuntime.isUndefined {
            disposeRuntime.call(withArguments: [])
        }

        nodes.eventSink = nil
        bridge?.detachAsyncResultSink()
        bridge?.detachModuleEventSink()

        // JavaScript wrappers release their handles through __stingDisposeRuntime.
        // This registry teardown is the final guarantee for raw or abandoned
        // handles that were created without a live JS wrapper.
        modules.disposeAllObjects()
    }

    private func installHostGlobals(in context: JSContext) {
        // JavaScriptCore embeds the ECMAScript runtime but does not provide every
        // browser/Node host API. Solid 2 schedules batched reactive work with
        // queueMicrotask, so Sting supplies the standard host primitive before
        // evaluating application code. Promise jobs use JavaScriptCore's native
        // microtask queue and preserve queueMicrotask ordering semantics.
        context.evaluateScript(
            """
            if (typeof globalThis.queueMicrotask !== "function") {
              globalThis.queueMicrotask = function queueMicrotask(callback) {
                if (typeof callback !== "function") {
                  throw new TypeError("queueMicrotask callback must be a function");
                }
                Promise.resolve().then(callback);
              };
            }
            """
        )
    }
}
