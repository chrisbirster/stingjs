package run.stingjs.runtime

import org.json.JSONArray
import org.json.JSONObject

class StingNativeBridge(
    private val nodes: StingNodeRegistry,
    private val modules: StingModuleRegistry = StingModuleRegistry(),
    private val reportError: (Throwable) -> Unit = { throw it },
) {
    var mutationCounts = StingMutationCounts()
        private set

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
            val args = JSONArray(argsJSON)
            val arguments = buildList {
                for (index in 0 until args.length()) {
                    val value = args.get(index)
                    add(if (value == JSONObject.NULL) null else value)
                }
            }
            JSONObject()
                .put("ok", true)
                .put("value", wrapJSON(modules.callSync(module, method, arguments)))
                .toString()
        } catch (error: StingNativeModuleError) {
            val nativeError = JSONObject()
                .put("code", error.code)
                .put("message", error.message)
                .put("module", module)
                .put("method", method)
            error.details?.let { nativeError.put("details", wrapJSON(it)) }
            JSONObject().put("ok", false).put("error", nativeError).toString()
        } catch (error: Throwable) {
            JSONObject()
                .put("ok", false)
                .put(
                    "error",
                    JSONObject()
                        .put("code", "E_NATIVE_CALL")
                        .put("message", error.message ?: error::class.java.simpleName)
                        .put("module", module)
                        .put("method", method),
                )
                .toString()
        }
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
