import Foundation
import UIKit

public typealias StingNativeModuleCompletion = (Result<Any?, Error>) -> Void
public typealias StingNativeModuleEventEmitter = (Any?) -> Void
public typealias StingNativeViewEventEmitter = (Any?) -> Void

/// Platform-neutral application/runtime lifecycle states delivered to native modules.
///
/// These values deliberately describe Sting semantics rather than UIKit application
/// states so the same module contract is available on Android. `runtimeDisposing`
/// belongs to the Sting runtime lifetime and is therefore reliable even when a
/// platform does not expose a process-termination callback.
public enum StingApplicationLifecycleEvent: String, Sendable {
    case foreground
    case active
    case inactive
    case background
    case runtimeDisposing
}

public protocol StingNativeObject: AnyObject {
    func callSync(method: String, arguments: [Any]) throws -> Any?
    func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    )
    func dispose()
}

public extension StingNativeObject {
    func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        completion(.failure(StingNativeModuleError(
            code: "E_OBJECT_METHOD_NOT_FOUND",
            message: "Native object does not implement asynchronous method \(method)"
        )))
    }

    func dispose() {}
}

public protocol StingNativeView: AnyObject {
    var view: UIView { get }
    var childContainer: UIView? { get }

    func setProperty(name: String, value: Any) throws
    func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeViewEventEmitter
    ) throws
    func didAttach()
    func didDetach()
    func dispose()
}

public extension StingNativeView {
    var childContainer: UIView? { nil }

    func setProperty(name: String, value: Any) throws {
        throw StingNativeModuleError(
            code: "E_VIEW_PROPERTY_NOT_FOUND",
            message: "Native view does not implement property \(name)"
        )
    }

    func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeViewEventEmitter
    ) throws {
        throw StingNativeModuleError(
            code: "E_VIEW_EVENT_NOT_FOUND",
            message: "Native view does not implement event \(event)"
        )
    }

    func didAttach() {}
    func didDetach() {}
    func dispose() {}
}

public protocol StingNativeModule: AnyObject {
    var name: String { get }
    var version: String { get }

    func callSync(method: String, arguments: [Any]) throws -> Any?
    func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    )
    func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeModuleEventEmitter
    ) throws
    func createObject(type: String, arguments: [Any]) throws -> any StingNativeObject
    func createView(type: String) throws -> any StingNativeView

    /// Receive shared Sting application/runtime lifecycle transitions.
    /// Implementations must not assume an engine-specific JavaScript value or a
    /// UIKit object is available here.
    func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent)

    /// Handle platform background work routed explicitly to this module.
    /// Completion may be asynchronous; the host owns any platform-specific
    /// background task token and is responsible for translating the result.
    func handleBackgroundEvent(
        name: String,
        payload: Any?,
        completion: @escaping StingNativeModuleCompletion
    )
}

public extension StingNativeModule {
    func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        completion(.failure(StingNativeModuleError(
            code: "E_METHOD_NOT_FOUND",
            message: "\(name) does not implement asynchronous method \(method)"
        )))
    }

    func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeModuleEventEmitter
    ) throws {
        throw StingNativeModuleError(
            code: "E_EVENT_NOT_FOUND",
            message: "\(name) does not implement native event \(event)"
        )
    }

    func createObject(type: String, arguments: [Any]) throws -> any StingNativeObject {
        throw StingNativeModuleError(
            code: "E_OBJECT_TYPE_NOT_FOUND",
            message: "\(name) does not implement native object type \(type)"
        )
    }

    func createView(type: String) throws -> any StingNativeView {
        throw StingNativeModuleError(
            code: "E_VIEW_TYPE_NOT_FOUND",
            message: "\(name) does not implement native view type \(type)"
        )
    }

    func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {}

    func handleBackgroundEvent(
        name: String,
        payload: Any?,
        completion: @escaping StingNativeModuleCompletion
    ) {
        completion(.failure(StingNativeModuleError(
            code: "E_BACKGROUND_EVENT_NOT_FOUND",
            message: "\(self.name) does not implement background event \(name)"
        )))
    }
}

public struct StingNativeModuleError: Error, LocalizedError {
    public let code: String
    public let message: String
    public let details: Any?

    public init(code: String, message: String, details: Any? = nil) {
        self.code = code
        self.message = message
        self.details = details
    }

    public var errorDescription: String? { message }
}
