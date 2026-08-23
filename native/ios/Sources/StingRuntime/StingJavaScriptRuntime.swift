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
}
