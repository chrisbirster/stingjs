package run.stingjs.runtime

interface StingNativeModule {
    val name: String
    val version: String

    fun callSync(method: String, arguments: List<Any?>): Any?
}

class StingNativeModuleError(
    val code: String,
    override val message: String,
    val details: Any? = null,
) : RuntimeException(message)
