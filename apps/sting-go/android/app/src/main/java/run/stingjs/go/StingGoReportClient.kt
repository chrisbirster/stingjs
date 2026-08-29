package run.stingjs.go

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

internal object StingGoReportClient {
    fun post(
        endpointUrl: String,
        kind: String,
        message: String,
        detail: String? = null,
    ) {
        val payload = JSONObject()
            .put("kind", kind)
            .put("platform", "android")
            .put("message", message)
        if (!detail.isNullOrBlank()) payload.put("detail", detail)

        val connection = URL(endpointUrl).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 2_000
        connection.readTimeout = 2_000
        connection.useCaches = false
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "StingGo/0.1.0")
        try {
            connection.outputStream.use { output ->
                output.write(payload.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                connection.errorStream?.close()
            } else {
                connection.inputStream?.close()
            }
        } finally {
            connection.disconnect()
        }
    }
}
