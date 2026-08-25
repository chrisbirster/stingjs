package run.stingjs.runtime

class StingModuleRegistry(modules: List<StingNativeModule> = emptyList()) {
    private val modules = linkedMapOf<String, StingNativeModule>()

    init {
        modules.forEach(::register)
    }

    fun register(module: StingNativeModule) {
        if (modules.containsKey(module.name)) {
            throw StingNativeModuleError(
                code = "E_DUPLICATE_MODULE",
                message = "A native module named ${module.name} is already registered",
            )
        }
        modules[module.name] = module
    }

    fun versions(): Map<String, String> = modules.values.associate { it.name to it.version }

    fun callSync(name: String, method: String, arguments: List<Any?>): Any? {
        val module = modules[name] ?: throw StingNativeModuleError(
            code = "E_MODULE_NOT_FOUND",
            message = "Native module $name is not registered",
        )
        return module.callSync(method, arguments)
    }
}
