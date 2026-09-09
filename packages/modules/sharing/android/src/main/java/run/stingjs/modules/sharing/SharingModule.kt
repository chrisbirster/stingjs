package run.stingjs.modules.sharing

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult

class SharingModule(context: Context) : StingNativeModule {
    override val name = "Sharing"
    override val version = "0.1.0"

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        throw StingNativeModuleError(
            code = "E_SYNC_UNSUPPORTED",
            message = "Sharing methods are asynchronous",
        )
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        if (method != "share") {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_METHOD_NOT_FOUND",
                        message = "Sharing does not implement asynchronous method $method",
                    ),
                ),
            )
            return
        }

        val payload = try {
            parse(arguments)
        } catch (error: StingNativeModuleError) {
            completion(StingNativeModuleResult.Failure(error))
            return
        }

        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    val body = listOf(payload.text, payload.url).filter { it.isNotEmpty() }.joinToString("\n")
                    putExtra(Intent.EXTRA_TEXT, body)
                    if (payload.subject.isNotEmpty()) putExtra(Intent.EXTRA_SUBJECT, payload.subject)
                }
                val chooser = Intent.createChooser(intent, null).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                appContext.startActivity(chooser)
                completion(StingNativeModuleResult.Success(null))
            } catch (_: ActivityNotFoundException) {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_SHARE_UNAVAILABLE",
                            message = "No application can handle the native share request",
                        ),
                    ),
                )
            } catch (error: Throwable) {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_SHARE_FAILED",
                            message = error.message ?: "Unable to open native share UI",
                        ),
                    ),
                )
            }
        }
    }

    private data class Payload(val text: String, val url: String, val subject: String)

    private fun parse(arguments: List<Any?>): Payload {
        val text = arguments.getOrNull(0) as? String
            ?: throw invalidArgument("Sharing.share requires a text string slot")
        val url = arguments.getOrNull(1) as? String
            ?: throw invalidArgument("Sharing.share requires a url string slot")
        val subject = arguments.getOrNull(2) as? String
            ?: throw invalidArgument("Sharing.share requires a subject string slot")
        if (text.isEmpty() && url.isEmpty()) {
            throw invalidArgument("Sharing.share requires text or url")
        }
        if (url.isNotEmpty()) {
            val parsed = android.net.Uri.parse(url)
            if (parsed.scheme.isNullOrEmpty()) {
                throw invalidArgument("Sharing url must be absolute")
            }
        }
        return Payload(text, url, subject)
    }

    private fun invalidArgument(message: String) = StingNativeModuleError(
        code = "E_INVALID_ARGUMENT",
        message = message,
    )
}
