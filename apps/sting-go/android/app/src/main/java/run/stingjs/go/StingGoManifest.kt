package run.stingjs.go

import org.json.JSONObject

data class StingGoManifest(
    val schemaVersion: Int,
    val runtimeVersion: String,
    val engine: String,
    val projectName: String,
    val bundlePath: String,
    val reloadPath: String,
    val healthPath: String,
    val reportPath: String?,
    val capabilities: Set<String>,
) {
    companion object {
        const val SUPPORTED_SCHEMA_VERSION = 1
        const val SUPPORTED_RUNTIME_VERSION = "0.1.0"
        const val SUPPORTED_ENGINE = "quickjs"

        fun parse(source: String): StingGoManifest {
            val json = JSONObject(source)
            val schemaVersion = json.getInt("schemaVersion")
            require(schemaVersion == SUPPORTED_SCHEMA_VERSION) {
                "Unsupported Sting Go manifest schema $schemaVersion; expected $SUPPORTED_SCHEMA_VERSION"
            }

            val runtimeVersion = json.getString("runtimeVersion")
            require(runtimeVersion == SUPPORTED_RUNTIME_VERSION) {
                "Project requires Sting runtime $runtimeVersion; this Sting Go supports $SUPPORTED_RUNTIME_VERSION"
            }

            val engine = json.getString("engine")
            require(engine == SUPPORTED_ENGINE) {
                "Project requires JavaScript engine $engine; this Sting Go uses $SUPPORTED_ENGINE"
            }

            val project = json.getJSONObject("project")
            val bundle = json.getJSONObject("bundle")
            val bundlePath = bundle.getString("path")
            require(bundlePath == "/bundle") { "Unsupported Sting Go bundle path $bundlePath" }
            require(bundle.getString("contentType") == "application/javascript") {
                "Unsupported Sting Go bundle content type"
            }

            val development = json.getJSONObject("development")
            val reload = development.getJSONObject("reload")
            val reloadPath = reload.getString("path")
            require(reloadPath == "/events") { "Unsupported Sting Go reload path $reloadPath" }
            require(reload.getString("transport") == "sse") {
                "Unsupported Sting Go reload transport; v1 requires sse"
            }
            require(reload.getString("contentType") == "text/event-stream") {
                "Unsupported Sting Go reload content type"
            }

            val health = development.getJSONObject("health")
            val healthPath = health.getString("path")
            require(healthPath == "/health") { "Unsupported Sting Go health path $healthPath" }
            require(health.getString("contentType") == "application/json") {
                "Unsupported Sting Go health content type"
            }

            val reportPath = development.optJSONObject("report")?.let { report ->
                val path = report.getString("path")
                require(path == "/report") { "Unsupported Sting Go report path $path" }
                require(report.getString("method") == "POST") {
                    "Unsupported Sting Go report method; v1 requires POST"
                }
                require(report.getString("contentType") == "application/json") {
                    "Unsupported Sting Go report content type"
                }
                path
            }

            val capabilitiesJson = json.getJSONArray("capabilities")
            val capabilities = buildSet {
                for (index in 0 until capabilitiesJson.length()) {
                    add(capabilitiesJson.getString(index))
                }
            }

            return StingGoManifest(
                schemaVersion = schemaVersion,
                runtimeVersion = runtimeVersion,
                engine = engine,
                projectName = project.getString("name"),
                bundlePath = bundlePath,
                reloadPath = reloadPath,
                healthPath = healthPath,
                reportPath = reportPath,
                capabilities = capabilities,
            )
        }
    }
}
