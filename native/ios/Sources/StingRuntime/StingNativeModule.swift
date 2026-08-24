import Foundation

public protocol StingNativeModule: AnyObject {
    var name: String { get }
    var version: String { get }

    func callSync(method: String, arguments: [Any]) throws -> Any?
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
