package run.stingjs.runtime

import android.content.Context

class StingModuleRegistry(modules: List<StingNativeModule> = emptyList()) {
    private data class NativeObjectEntry(
        val module: String,
        val value: StingNativeObject,
    )

    private val modules = linkedMapOf<String, StingNativeModule>()
    private val objectLock = Any()
    private val objects = linkedMapOf<Int, NativeObjectEntry>()
    private var nextObjectHandle = 1

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

    fun createView(name: String, type: String, context: Context): StingNativeView =
        requireModule(name).createView(type, context)

    fun callSync(name: String, method: String, arguments: List<Any?>): Any? {
        val module = requireModule(name)

        return when (method) {
            OBJECT_CREATE_METHOD -> {
                val type = requireStringArgument(arguments, 0, "native object type")
                createObject(module, type, arguments.drop(1))
            }

            OBJECT_CALL_SYNC_METHOD -> {
                val handle = requireHandleArgument(arguments)
                val objectMethod = requireStringArgument(arguments, 1, "native object method")
                requireObject(name, handle).callSync(objectMethod, arguments.drop(2))
            }

            OBJECT_DISPOSE_METHOD -> {
                val handle = requireHandleArgument(arguments)
                disposeObject(name, handle)
                null
            }

            else -> module.callSync(method, arguments)
        }
    }

    fun callAsync(
        name: String,
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        val module = modules[name]
        if (module == null) {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_MODULE_NOT_FOUND",
                        message = "Native module $name is not registered",
                    ),
                ),
            )
            return
        }

        if (method == OBJECT_CALL_ASYNC_METHOD) {
            try {
                val handle = requireHandleArgument(arguments)
                val objectMethod = requireStringArgument(arguments, 1, "native object method")
                requireObject(name, handle).callAsync(objectMethod, arguments.drop(2), completion)
            } catch (error: Throwable) {
                completion(StingNativeModuleResult.Failure(error))
            }
            return
        }

        module.callAsync(method, arguments, completion)
    }

    fun setEventEnabled(
        name: String,
        event: String,
        enabled: Boolean,
        emit: StingNativeModuleEventEmitter,
    ) {
        val module = requireModule(name)
        module.setEventEnabled(event, enabled, emit)
    }

    fun disposeAllObjects() {
        val active = synchronized(objectLock) {
            val entries = objects.toList()
            objects.clear()
            entries
        }

        // LinkedHashMap preserves monotonically allocated handle order, making
        // teardown deterministic while still releasing every remaining object.
        for ((_, entry) in active) {
            try {
                entry.value.dispose()
            } catch (_: Throwable) {
                // Runtime teardown must continue releasing the remaining native
                // resources even if a module's dispose hook misbehaves.
            }
        }
    }

    private fun requireModule(name: String): StingNativeModule =
        modules[name] ?: throw StingNativeModuleError(
            code = "E_MODULE_NOT_FOUND",
            message = "Native module $name is not registered",
        )

    private fun createObject(
        module: StingNativeModule,
        type: String,
        arguments: List<Any?>,
    ): Int {
        val value = module.createObject(type, arguments)

        return synchronized(objectLock) {
            if (nextObjectHandle <= 0) {
                throw StingNativeModuleError(
                    code = "E_OBJECT_HANDLE_EXHAUSTED",
                    message = "Native object handle space is exhausted for this Sting runtime",
                )
            }

            val handle = nextObjectHandle
            nextObjectHandle += 1
            objects[handle] = NativeObjectEntry(module.name, value)
            handle
        }
    }

    private fun requireObject(name: String, handle: Int): StingNativeObject = synchronized(objectLock) {
        val entry = objects[handle] ?: throw StingNativeModuleError(
            code = "E_OBJECT_NOT_FOUND",
            message = "Native object handle $handle is stale or unknown",
            details = mapOf("handle" to handle),
        )

        if (entry.module != name) {
            throw StingNativeModuleError(
                code = "E_OBJECT_MODULE_MISMATCH",
                message = "Native object handle $handle belongs to ${entry.module}, not $name",
                details = mapOf("handle" to handle, "owner" to entry.module),
            )
        }

        entry.value
    }

    private fun disposeObject(name: String, handle: Int) {
        val entry = synchronized(objectLock) {
            val current = objects[handle] ?: throw StingNativeModuleError(
                code = "E_OBJECT_NOT_FOUND",
                message = "Native object handle $handle is stale or unknown",
                details = mapOf("handle" to handle),
            )

            if (current.module != name) {
                throw StingNativeModuleError(
                    code = "E_OBJECT_MODULE_MISMATCH",
                    message = "Native object handle $handle belongs to ${current.module}, not $name",
                    details = mapOf("handle" to handle, "owner" to current.module),
                )
            }

            objects.remove(handle)!!
        }

        entry.value.dispose()
    }

    private fun requireHandleArgument(arguments: List<Any?>): Int {
        val value = arguments.firstOrNull() as? Number ?: throw StingNativeModuleError(
            code = "E_INVALID_OBJECT_HANDLE",
            message = "Native object operation requires a positive integer handle",
        )
        val handle = value.toInt()
        if (handle <= 0 || value.toDouble() != handle.toDouble()) {
            throw StingNativeModuleError(
                code = "E_INVALID_OBJECT_HANDLE",
                message = "Native object operation requires a positive integer handle",
                details = value,
            )
        }
        return handle
    }

    private fun requireStringArgument(
        arguments: List<Any?>,
        index: Int,
        label: String,
    ): String {
        val value = arguments.getOrNull(index) as? String
        if (value.isNullOrEmpty()) {
            throw StingNativeModuleError(
                code = "E_INVALID_OBJECT_ARGUMENT",
                message = "$label must be a non-empty string",
            )
        }
        return value
    }

    private companion object {
        const val OBJECT_CREATE_METHOD = "__sting_object_create"
        const val OBJECT_CALL_SYNC_METHOD = "__sting_object_call_sync"
        const val OBJECT_CALL_ASYNC_METHOD = "__sting_object_call_async"
        const val OBJECT_DISPOSE_METHOD = "__sting_object_dispose"
    }
}
