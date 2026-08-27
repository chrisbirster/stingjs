import Foundation

public typealias StingNativeModuleCompletion = (Result<Any?, Error>) -> Void

public protocol StingNativeModule: AnyObject {
    var name: String { get }
    var version: String { get }

    func callSync(method: String, arguments: [Any]) throws -> Any?
    func callAsync(
        method: String,
        arguments: [Any],
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
