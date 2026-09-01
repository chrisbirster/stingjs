package run.stingjs.modules.backgroundtask

import android.content.Context
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter
import run.stingjs.runtime.StingNativeModuleResult

class BackgroundTaskModule(context: Context) : StingNativeModule {
    override val name = "BackgroundTask"
    override val version = "0.1.0"
    private val prefs = context.getSharedPreferences("sting.background-task", Context.MODE_PRIVATE)
    private var emitter: StingNativeModuleEventEmitter? = null

    override fun callSync(method: String, arguments: List<Any?>): Any? = throw StingNativeModuleError("E_METHOD_NOT_FOUND", "BackgroundTask does not implement synchronous method $method")
    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        when (method) {
            "register" -> {
                val task = arguments.firstOrNull() as? String ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_INVALID_ARGUMENT", "Background task name is required."))); return }
                val values = registered().toMutableSet(); values += task; save(values); completion(StingNativeModuleResult.Success(null))
            }
            "unregister" -> {
                val task = arguments.firstOrNull() as? String ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_INVALID_ARGUMENT", "Background task name is required."))); return }
                val values = registered().toMutableSet(); values -= task; save(values); completion(StingNativeModuleResult.Success(null))
            }
            "getRegistered" -> completion(StingNativeModuleResult.Success(registered().sorted()))
            else -> completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_METHOD_NOT_FOUND", "BackgroundTask does not implement asynchronous method $method")))
        }
    }
    override fun setEventEnabled(event: String, enabled: Boolean, emit: StingNativeModuleEventEmitter) {
        if (event != "run") throw StingNativeModuleError("E_EVENT_NOT_FOUND", "BackgroundTask does not implement event $event")
        emitter = if (enabled) emit else null
    }
    override fun handleBackgroundEvent(name: String, payload: Any?, completion: StingNativeModuleCompletion) {
        if (!registered().contains(name)) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_BACKGROUND_TASK_NOT_REGISTERED", "Background task $name is not registered."))); return }
        emitter?.invoke(mapOf("name" to name, "payload" to payload))
        completion(StingNativeModuleResult.Success(mapOf("accepted" to true)))
    }
    private fun registered(): Set<String> = prefs.getStringSet("registrations", emptySet())?.toSet() ?: emptySet()
    private fun save(values: Set<String>) { prefs.edit().putStringSet("registrations", values).apply() }
}
