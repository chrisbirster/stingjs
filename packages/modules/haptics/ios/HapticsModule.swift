import StingRuntime
import UIKit

public final class HapticsModule: StingNativeModule {
    public let name = "Haptics"
    public let version = "0.1.0"

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        guard method == "impact" else {
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Haptics does not implement \(method)"
            )
        }

        let rawStyle = arguments.first as? String ?? "medium"
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch rawStyle {
        case "light": style = .light
        case "heavy": style = .heavy
        case "soft": style = .soft
        case "rigid": style = .rigid
        default: style = .medium
        }

        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
        return nil
    }
}
