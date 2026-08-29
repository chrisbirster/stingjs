package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.view.ViewGroup

sealed class StingNativeModuleResult {
    data class Success(val value: Any?) : StingNativeModuleResult()
    data class Failure(val error: Throwable) : StingNativeModuleResult()
}

typealias StingNativeModuleCompletion = (StingNativeModuleResult) -> Unit
typealias StingNativeModuleEventEmitter = (Any?) -> Unit
typealias StingNativeViewEventEmitter = (Any?) -> Unit

/**
 * Platform-neutral lifecycle events delivered to Sting native modules.
 *
 * These are runtime/application semantics rather than Android Activity objects
 * or process callbacks, so the same contract is exposed on iOS.
 */
enum class StingApplicationLifecycleEvent {
    FOREGROUND,
    ACTIVE,
    INACTIVE,
    BACKGROUND,
    RUNTIME_DISPOSING,
}

interface StingNativeObject {
    fun callSync(method: String, arguments: List<Any?>): Any?

    fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        completion(
            StingNativeModuleResult.Failure(
                StingNativeModuleError(
                    code = "E_OBJECT_METHOD_NOT_FOUND",
                    message = "Native object does not implement asynchronous method $method",
                ),
            ),
        )
    }

    fun dispose() {}
}

interface StingNativeView {
    val view: View
    val childContainer: ViewGroup? get() = null

    fun setProperty(name: String, value: Any?) {
        throw StingNativeModuleError(
            code = "E_VIEW_PROPERTY_NOT_FOUND",
            message = "Native view does not implement property $name",
        )
    }

    fun setEventEnabled(
        event: String,
        enabled: Boolean,
        emit: StingNativeViewEventEmitter,
    ) {
        throw StingNativeModuleError(
            code = "E_VIEW_EVENT_NOT_FOUND",
            message = "Native view does not implement event $event",
        )
    }

    fun didAttach() {}
    fun didDetach() {}
    fun dispose() {}
}

interface StingNativeModule {
    val name: String
    val version: String

    fun callSync(method: String, arguments: List<Any?>): Any?

    fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        completion(
            StingNativeModuleResult.Failure(
                StingNativeModuleError(
                    code = "E_METHOD_NOT_FOUND",
                    message = "$name does not implement asynchronous method $method",
                ),
            ),
        )
    }

    fun setEventEnabled(
        event: String,
        enabled: Boolean,
        emit: StingNativeModuleEventEmitter,
    ) {
        throw StingNativeModuleError(
            code = "E_EVENT_NOT_FOUND",
            message = "$name does not implement native event $event",
        )
    }

    fun createObject(type: String, arguments: List<Any?>): StingNativeObject {
        throw StingNativeModuleError(
            code = "E_OBJECT_TYPE_NOT_FOUND",
            message = "$name does not implement native object type $type",
        )
    }

    fun createView(type: String, context: Context): StingNativeView {
        throw StingNativeModuleError(
            code = "E_VIEW_TYPE_NOT_FOUND",
            message = "$name does not implement native view type $type",
        )
    }

    /** Receive shared Sting application/runtime lifecycle transitions. */
    fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {}

    /**
     * Handle background work routed explicitly to this module. Platform hosts
     * retain ownership of Activity/Service/background-task objects; none cross
     * this API boundary.
     */
    fun handleBackgroundEvent(
        name: String,
        payload: Any?,
        completion: StingNativeModuleCompletion,
    ) {
        completion(
            StingNativeModuleResult.Failure(
                StingNativeModuleError(
                    code = "E_BACKGROUND_EVENT_NOT_FOUND",
                    message = "${this.name} does not implement background event $name",
                ),
            ),
        )
    }
}

class StingNativeModuleError(
    val code: String,
    override val message: String,
    val details: Any? = null,
) : RuntimeException(message)
