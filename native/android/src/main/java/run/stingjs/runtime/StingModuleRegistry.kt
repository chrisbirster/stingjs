package run.stingjs.runtime

import android.content.Context

class StingModuleRegistry(modules: List<StingNativeModule> = emptyList()) {
    private data class NativeObjectEntry(
        val module: String,
        val value: StingNativeObject,
    )

    private data class PermissionRequestKey(
        val module: String,
        val permission: String,
    )

    private data class PendingPermissionRequest(
        val id: Long,
        val waiters: MutableList<StingNativeModuleCompletion>,
    )

    private val modules = linkedMapOf<String, StingNativeModule>()
    private val objectLock = Any()
    private val objects = linkedMapOf<Int, NativeObjectEntry>()
    private var nextObjectHandle = 1
    private val permissionLock = Any()
    private val pendingPermissionRequests = linkedMapOf<PermissionRequestKey, PendingPermissionRequest>()
    private var nextPermissionRequestId = 1L
    private var permissionRequestsDisposed = false
    private var runtimeDisposingDelivered = false

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
            PERMISSION_STATUS_METHOD -> {
                val permission = requirePermissionArgument(arguments)
                module.permissionStatus(permission).wireValue
            }

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

        if (method == PERMISSION_REQUEST_METHOD) {
            val permission = try {
                requirePermissionArgument(arguments)
            } catch (error: Throwable) {
                completion(StingNativeModuleResult.Failure(error))
                return
            }
            requestPermission(name, module, permission, completion)
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

    /**
     * Delivers a semantic lifecycle transition to every module in registration
     * order. Runtime disposal is terminal and emitted at most once.
     */
    fun dispatchLifecycle(event: StingApplicationLifecycleEvent) {
        if (event == StingApplicationLifecycleEvent.RUNTIME_DISPOSING) {
            if (runtimeDisposingDelivered) return
            runtimeDisposingDelivered = true
            disposePendingPermissionRequests()
        } else if (runtimeDisposingDelivered) {
            return
        }

        modules.values.forEach { it.onApplicationLifecycle(event) }
    }

    /** Route portable background work to one module without exposing Android host objects. */
    fun deliverBackgroundEvent(
        name: String,
        event: String,
        payload: Any?,
        completion: StingNativeModuleCompletion,
    ) {
        if (event.isEmpty()) {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_INVALID_BACKGROUND_EVENT",
                        message = "Background event name must not be empty",
                    ),
                ),
            )
            return
        }
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
        if (runtimeDisposingDelivered) {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_RUNTIME_DISPOSED",
                        message = "Sting runtime is already disposing",
                    ),
                ),
            )
            return
        }

        module.handleBackgroundEvent(event, payload, completion)
    }

    /** Final module ownership cleanup for one Sting runtime. */
    fun dispose() {
        dispatchLifecycle(StingApplicationLifecycleEvent.RUNTIME_DISPOSING)
        disposeAllObjects()
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

    private fun requestPermission(
        moduleName: String,
        module: StingNativeModule,
        permission: String,
        completion: StingNativeModuleCompletion,
    ) {
        val key = PermissionRequestKey(moduleName, permission)
        var requestId = 0L
        var disposed = false

        synchronized(permissionLock) {
            if (permissionRequestsDisposed) {
                disposed = true
            } else {
                val pending = pendingPermissionRequests[key]
                if (pending != null) {
                    pending.waiters += completion
                    return
                }

                requestId = nextPermissionRequestId
                nextPermissionRequestId += 1
                if (nextPermissionRequestId <= 0) nextPermissionRequestId = 1
                pendingPermissionRequests[key] = PendingPermissionRequest(
                    id = requestId,
                    waiters = mutableListOf(completion),
                )
            }
        }

        if (disposed) {
            completion(StingNativeModuleResult.Failure(runtimeDisposedError()))
            return
        }

        module.requestPermission(permission) { result ->
            completePermissionRequest(key, requestId, result)
        }
    }

    private fun completePermissionRequest(
        key: PermissionRequestKey,
        requestId: Long,
        result: Result<StingPermissionStatus>,
    ) {
        val waiters = synchronized(permissionLock) {
            if (permissionRequestsDisposed) return
            val pending = pendingPermissionRequests[key] ?: return
            if (pending.id != requestId) return
            pendingPermissionRequests.remove(key)
            pending.waiters.toList()
        }

        val mapped = result.fold(
            onSuccess = { StingNativeModuleResult.Success(it.wireValue) },
            onFailure = { StingNativeModuleResult.Failure(it) },
        )
        waiters.forEach { it(mapped) }
    }

    private fun disposePendingPermissionRequests() {
        val waiters = synchronized(permissionLock) {
            if (permissionRequestsDisposed) return
            permissionRequestsDisposed = true
            val active = pendingPermissionRequests.values.flatMap { it.waiters }
            pendingPermissionRequests.clear()
            active
        }

        waiters.forEach {
            it(StingNativeModuleResult.Failure(runtimeDisposedError()))
        }
    }

    private fun runtimeDisposedError() = StingNativeModuleError(
        code = "E_RUNTIME_DISPOSED",
        message = "Sting runtime is already disposing",
    )

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

    private fun requirePermissionArgument(arguments: List<Any?>): String {
        val permission = arguments.firstOrNull() as? String
        if (permission.isNullOrBlank()) {
            throw StingNativeModuleError(
                code = "E_INVALID_PERMISSION",
                message = "Native permission name must be a non-empty string",
            )
        }
        return permission.trim()
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
        const val PERMISSION_STATUS_METHOD = "__sting_permission_status"
        const val PERMISSION_REQUEST_METHOD = "__sting_permission_request"
        const val OBJECT_CREATE_METHOD = "__sting_object_create"
        const val OBJECT_CALL_SYNC_METHOD = "__sting_object_call_sync"
        const val OBJECT_CALL_ASYNC_METHOD = "__sting_object_call_async"
        const val OBJECT_DISPOSE_METHOD = "__sting_object_dispose"
    }
}
