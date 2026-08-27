package run.stingjs.modules.device

import android.os.Build
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError

class DeviceModule : StingNativeModule {
    override val name = "Device"
    override val version = "0.1.0"

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        if (method != "getInfo") {
            throw StingNativeModuleError(
                code = "E_METHOD_NOT_FOUND",
                message = "Device does not implement $method",
            )
        }

        return mapOf(
            "platform" to "android",
            "model" to Build.MODEL.orEmpty(),
            "manufacturer" to Build.MANUFACTURER.orEmpty(),
            "osName" to "Android",
            "osVersion" to Build.VERSION.RELEASE.orEmpty(),
            "isPhysicalDevice" to !isProbablyEmulator(),
        )
    }

    private fun isProbablyEmulator(): Boolean {
        val fingerprint = Build.FINGERPRINT.orEmpty().lowercase()
        val model = Build.MODEL.orEmpty().lowercase()
        val product = Build.PRODUCT.orEmpty().lowercase()
        val hardware = Build.HARDWARE.orEmpty().lowercase()

        return fingerprint.startsWith("generic") ||
            fingerprint.contains("emulator") ||
            model.contains("google_sdk") ||
            model.contains("emulator") ||
            product.contains("sdk_gphone") ||
            hardware.contains("goldfish") ||
            hardware.contains("ranchu")
    }
}
