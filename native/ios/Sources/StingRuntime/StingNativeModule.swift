import Foundation

public typealias StingNativeModuleCompletion = (Result<Any?, Error>) -> Void
public typealias StingNativeModuleEventEmitter = (Any?) -> Void

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
