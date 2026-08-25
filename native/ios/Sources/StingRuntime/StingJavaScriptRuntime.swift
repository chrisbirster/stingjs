import Foundation
import JavaScriptCore
import UIKit

public final class StingJavaScriptRuntime {
    public let context: JSContext

    private let nodes: StingNodeRegistry
    private let modules: StingModuleRegistry
    private var bridge: StingJavaScriptBridge?
    private var lastException: String?

    public init(rootView: UIView, modules nativeModules: [any StingNativeModule] = []) throws {
        guard let context = JSContext() else {
            throw StingRuntimeError("Unable to create JavaScriptCore context")
        }

        self.context = context
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
            reportError: { [weak context] error in
                context?.exception = JSValue(newErrorFromMessage: error.localizedDescription, in: context)
            }
        )
        self.bridge = bridge
        context.setObject(bridge, forKeyedSubscript: "__stingNativeBridge" as NSString)

        nodes.eventSink = { [weak context] nodeId, event, payloadJSON in
            context?.objectForKeyedSubscript("__stingDispatchEvent")?.call(
                withArguments: [nodeId, event, payloadJSON]
            )
        }
    }

    public func evaluate(bundle: String, sourceURL: URL? = nil) throws {
        lastException = nil
        if let sourceURL {
            context.evaluateScript(bundle, withSourceURL: sourceURL)
        } else {
            context.evaluateScript(bundle)
        }

        if let lastException {
            throw StingRuntimeError(lastException)
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
