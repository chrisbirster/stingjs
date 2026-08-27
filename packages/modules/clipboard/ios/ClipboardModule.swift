import StingRuntime
import UIKit

public final class ClipboardModule: StingNativeModule {
    public let name = "Clipboard"
    public let version = "0.1.0"

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        switch method {
        case "getString":
            return UIPasteboard.general.string ?? ""
        case "setString":
            guard let value = arguments.first as? String else {
                throw StingNativeModuleError(
                    code: "E_INVALID_ARGUMENT",
                    message: "Clipboard.setString requires a string"
                )
            }
            UIPasteboard.general.string = value
            return nil
        case "hasString":
            return !(UIPasteboard.general.string ?? "").isEmpty
        case "clear":
            UIPasteboard.general.items = []
            return nil
        default:
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Clipboard does not implement \(method)"
            )
        }
    }
}
