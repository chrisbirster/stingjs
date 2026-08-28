package run.stingjs.runtime

import org.json.JSONArray
import org.json.JSONObject

private data class StingModuleEventKey(
    val module: String,
    val event: String,
)

class StingNativeBridge(
    private val nodes: StingNodeRegistry,
    private val modules: StingModuleRegistry = StingModuleRegistry(),
    private val reportError: (Throwable) -> Unit = { throw it },
) {
    private val asyncLock = Any()
    private val activeAsyncRequestIds = mutableSetOf<Int>()
    private val moduleEventLock = Any()
    private val activeModuleEvents = mutableSetOf<StingModuleEventKey>()

    @Volatile
    var asyncResultSink: ((Int, String) -> Unit)? = null

    @Volatile
    var moduleEventSink: ((String, String, String) -> Unit)? = null

    var mutationCounts = StingMutationCounts()
        private set

    init {
        nodes.moduleViewFactory = { module, viewType, context ->
            modules.createView(module, viewType, context)
        }
    }

    fun resetMutationCounts() {
        mutationCounts = StingMutationCounts()
    }

    fun getRuntimeInfo(): String = JSONObject()
        .put("protocolVersion", 1)
        .put("platform", "android")
        .put("modules", JSONObject(modules.versions()))
        .toString()

    fun createElement(id: Int, type: String) {
        mutationCounts.createElement += 1
        perform { nodes.createElement(id, type) }
    }

    fun createTextNode(id: Int, value: String) {
        mutationCounts.createTextNode += 1
        perform { nodes.createTextNode(id, value) }
    }

    fun replaceText(id: Int, value: String) {
        mutationCounts.replaceText += 1
        perform { nodes.replaceText(id, value) }
    }

    fun setProperty(id: Int, name: String, valueJSON: String) {
        mutationCounts.setProperty += 1
        perform { nodes.setProperty(id, name, valueJSON) }
    }

    fun insertNode(parentId: Int, nodeId: Int, anchorId: Int) {
        mutationCounts.insertNode += 1
        perform { nodes.insertNode(parentId, nodeId, anchorId) }
    }

    fun removeNode(parentId: Int, nodeId: Int) {
        mutationCounts.removeNode += 1
        perform { nodes.removeNode(parentId, nodeId) }
    }

    fun setEventEnabled(id: Int, event: String, enabled: Boolean) {
        mutationCounts.setEventEnabled += 1
        perform { nodes.setEventEnabled(id, event, enabled) }
    }

    fun callModuleSync(module: String, method: String, argsJSON: String): String {
        return try {
            JSONObject()
                .put("ok", true)
                .put("value", wrapJSON(modules.callSync(module, method, decodeArguments(argsJSON))))
                .toString()
        } catch (error: Throwable) {
            encodeErrorResponse(error, module, method)
        }
    }

    fun callModuleAsync(module: String, method: String, argsJSON: String, requestId: Int) {
        val inserted = synchronized(asyncLock) { activeAsyncRequestIds.add(requestId) }
        if (!inserted) {
            reportError(
                StingNativeModuleError(
                    code = "E_DUPLICATE_REQUEST",
                    message = "Asynchronous native request $requestId is already pending",
                ),
            )
            return
        }

        try {
            modules.callAsync(module, method, decodeArguments(argsJSON)) { result ->
                completeModuleAsync(requestId, module, method, result)
            }
        } catch (error: Throwable) {
            completeModuleAsync(
                requestId,
                module,
                method,
                StingNativeModuleResult.Failure(error),
            )
        }
    }

    fun setModuleEventEnabled(module: String, event: String, enabled: Boolean): String {
        val key = StingModuleEventKey(module, event)
        return try {
            if (enabled) {
                val inserted = synchronized(moduleEventLock) { activeModuleEvents.add(key) }
                if (inserted) {
                    try {
                        modules.setEventEnabled(module, event, true) { payload ->
                            emitModuleEvent(key, payload)
                        }
                    } catch (error: Throwable) {
                        synchronized(moduleEventLock) { activeModuleEvents.remove(key) }
                        throw error
                    }
                }
            } else {
                val removed = synchronized(moduleEventLock) { activeModuleEvents.remove(key) }
                if (removed) {
                    modules.setEventEnabled(module, event, false) { _ -> }
                }
            }

            JSONObject()
                .put("ok", true)
                .put("value", JSONObject.NULL)
                .toString()
        } catch (error: Throwable) {
            encodeErrorResponse(error, module, "addListener:$event")
        }
    }

    fun isModuleEventActive(module: String, event: String): Boolean =
        synchronized(moduleEventLock) {
            activeModuleEvents.contains(StingModuleEventKey(module, event))
        }

    fun detachAsyncResultSink() {
        asyncResultSink = null
        synchronized(asyncLock) { activeAsyncRequestIds.clear() }
    }

    fun detachModuleEventSink() {
        val observations = synchronized(moduleEventLock) {
            val active = activeModuleEvents.toList()
            activeModuleEvents.clear()
            moduleEventSink = null
            active
        }

        for (key in observations) {
            try {
                modules.setEventEnabled(key.module, key.event, false) { _ -> }
            } catch (_: Throwable) {
                // Teardown must continue for every observation. JS/native bridge
                // state is already detached, so later emissions are stale no-ops.
            }
        }
    }

    fun disposeNativeViews() {
        nodes.dispose()
    }

    fun disposeNativeObjects() {
        modules.disposeAllObjects()
    }

    private fun completeModuleAsync(
        requestId: Int,
        module: String,
        method: String,
        result: StingNativeModuleResult,
    ) {
        val claimed = synchronized(asyncLock) { activeAsyncRequestIds.remove(requestId) }
        if (!claimed) return

        val response = when (result) {
            is StingNativeModuleResult.Success -> JSONObject()
                .put("ok", true)
                .put("value", wrapJSON(result.value))
                .toString()

            is StingNativeModuleResult.Failure ->
                encodeErrorResponse(result.error, module, method)
        }

        asyncResultSink?.invoke(requestId, response)
    }

    private fun emitModuleEvent(key: StingModuleEventKey, payload: Any?) {
        val payloadJSON = encodeJSONValue(payload)
        val sink = synchronized(moduleEventLock) {
            if (!activeModuleEvents.contains(key)) return
            moduleEventSink
        }
        sink?.invoke(key.module, key.event, payloadJSON)
    }

    private fun decodeArguments(argsJSON: String): List<Any?> {
        val args = JSONArray(argsJSON)
        return buildList {
            for (index in 0 until args.length()) {
                val value = args.get(index)
                add(if (value == JSONObject.NULL) null else value)
            }
        }
    }

    private fun encodeErrorResponse(error: Throwable, module: String, method: String): String {
        val nativeError = JSONObject()
            .put("code", if (error is StingNativeModuleError) error.code else "E_NATIVE_CALL")
            .put("message", error.message ?: error::class.java.simpleName)
            .put("module", module)
            .put("method", method)

        if (error is StingNativeModuleError) {
            error.details?.let { nativeError.put("details", wrapJSON(it)) }
        }

        return JSONObject().put("ok", false).put("error", nativeError).toString()
    }

    private fun encodeJSONValue(value: Any?): String {
        // Android's org.json implementation does not expose JSONObject.valueToString.
        // A single-element JSONArray gives us the same standards-compliant JSON
        // fragment encoding for null, strings, numbers, booleans, objects, and arrays.
        val encoded = JSONArray().put(wrapJSON(value)).toString()
        return encoded.substring(1, encoded.length - 1)
    }

    private fun perform(operation: () -> Unit) {
        try {
            operation()
        } catch (error: Throwable) {
            reportError(error)
        }
    }

    private fun wrapJSON(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is JSONObject, is JSONArray, is String, is Number, is Boolean -> value
        else -> JSONObject.wrap(value) ?: value.toString()
    }
}
