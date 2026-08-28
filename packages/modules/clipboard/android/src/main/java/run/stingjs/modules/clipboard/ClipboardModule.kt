package run.stingjs.modules.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError

class ClipboardModule(context: Context) : StingNativeModule {
    override val name = "Clipboard"
    override val version = "0.1.0"

    private val appContext = context.applicationContext
    private val clipboard = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    override fun callSync(method: String, arguments: List<Any?>): Any? = when (method) {
        "getString" -> readString()
        "setString" -> {
            val value = arguments.firstOrNull() as? String
                ?: throw StingNativeModuleError(
                    code = "E_INVALID_ARGUMENT",
                    message = "Clipboard.setString requires a string",
                )
            clipboard.setPrimaryClip(ClipData.newPlainText("StingJS", value))
            null
        }
        "hasString" -> readString().isNotEmpty()
        "clear" -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                clipboard.clearPrimaryClip()
            } else {
                clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
            }
            null
        }
        else -> throw StingNativeModuleError(
            code = "E_METHOD_NOT_FOUND",
            message = "Clipboard does not implement $method",
        )
    }

    private fun readString(): String {
        val clip = clipboard.primaryClip ?: return ""
        if (clip.itemCount == 0) return ""
        return clip.getItemAt(0).coerceToText(appContext)?.toString().orEmpty()
    }
}
