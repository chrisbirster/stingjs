package run.stingjs.runtime

sealed class StingNativeModuleResult {
    data class Success(val value: Any?) : StingNativeModuleResult()
    data class Failure(val error: Throwable) : StingNativeModuleResult()
}

typealias StingNativeModuleCompletion = (StingNativeModuleResult) -> Unit
typealias StingNativeModuleEventEmitter = (Any?) -> Unit

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
}

class StingNativeModuleError(
    val code: String,
    override val message: String,
    val details: Any? = null,
) : RuntimeException(message)
