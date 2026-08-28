package run.stingjs.modules.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError

class HapticsModule(context: Context) : StingNativeModule {
    override val name = "Haptics"
    override val version = "0.1.0"

    private val appContext = context.applicationContext

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        if (method != "impact") {
            throw StingNativeModuleError(
                code = "E_METHOD_NOT_FOUND",
                message = "Haptics does not implement $method",
            )
        }

        val style = arguments.firstOrNull() as? String ?: "medium"
        val (durationMs, amplitude) = when (style) {
            "light" -> 12L to 70
            "heavy" -> 28L to 220
            "soft" -> 18L to 90
            "rigid" -> 16L to 180
            else -> 20L to 140
        }

        vibrate(durationMs, amplitude)
        return null
    }

    @Suppress("DEPRECATION")
    private fun vibrate(durationMs: Long, amplitude: Int) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            appContext.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            appContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (!vibrator.hasVibrator()) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amplitude))
        } else {
            vibrator.vibrate(durationMs)
        }
    }
}
