import StingRuntime
import UIKit

public final class DeviceModule: StingNativeModule {
    public let name = "Device"
    public let version = "0.1.0"

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        guard method == "getInfo" else {
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Device does not implement \(method)"
            )
        }

        #if targetEnvironment(simulator)
        let isPhysicalDevice = false
        #else
        let isPhysicalDevice = true
        #endif

        let device = UIDevice.current
        return [
            "platform": "ios",
            "model": device.model,
            "manufacturer": "Apple",
            "osName": device.systemName,
            "osVersion": device.systemVersion,
            "isPhysicalDevice": isPhysicalDevice,
        ]
    }
}
