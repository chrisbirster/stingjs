package run.stingjs.go

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

data class StingGoReloadEvent(
    val name: String,
    val version: Long,
)

class StingGoReloadClient(
    private val endpointUrl: String,
    private val onEvent: (StingGoReloadEvent) -> Unit,
    private val onStatus: (String) -> Unit = {},
    private val initialReconnectDelayMs: Long = 250,
    private val maxReconnectDelayMs: Long = 2_000,
) : AutoCloseable {
    private val executor = Executors.newSingleThreadExecutor()
    private val started = AtomicBoolean(false)

    @Volatile
    private var closed = false

    @Volatile
    private var activeConnection: HttpURLConnection? = null

    fun start() {
        if (!started.compareAndSet(false, true)) return
        executor.execute(::runLoop)
    }

    override fun close() {
        if (closed) return
        closed = true
        activeConnection?.disconnect()
        executor.shutdownNow()
    }

    private fun runLoop() {
        var reconnectDelayMs = initialReconnectDelayMs

        while (!closed && !Thread.currentThread().isInterrupted) {
            try {
                consumeOnce()
                if (!closed) throw IOException("Sting Go reload stream closed")
            } catch (error: Throwable) {
                if (closed || Thread.currentThread().isInterrupted) return
                runCatching {
                    onStatus("Reconnecting: ${error.message ?: error.javaClass.simpleName}")
                }

                try {
                    Thread.sleep(reconnectDelayMs)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return
                }
                reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(maxReconnectDelayMs)
            }
        }
    }

    private fun consumeOnce() {
        val connection = URL(endpointUrl).openConnection() as HttpURLConnection
        activeConnection = connection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 0
        connection.useCaches = false
        connection.setRequestProperty("Accept", "text/event-stream")
        connection.setRequestProperty("Cache-Control", "no-cache")
        connection.setRequestProperty("User-Agent", "StingGo/0.1.0")

        try {
            val status = connection.responseCode
            require(status in 200..299) { "HTTP $status from $endpointUrl" }
            val mediaType = connection.contentType
                ?.substringBefore(';')
                ?.trim()
                ?.lowercase()
            require(mediaType == "text/event-stream") {
                "Expected text/event-stream from $endpointUrl, got ${connection.contentType ?: "no content type"}"
            }
            runCatching { onStatus("Live") }

            connection.inputStream.bufferedReader().use { reader ->
                var eventName: String? = null
                val data = StringBuilder()

                fun dispatchEvent() {
                    if (data.isNotEmpty()) {
                        parseEvent(eventName, data.toString())?.let(onEvent)
                    }
                    eventName = null
                    data.setLength(0)
                }

                while (!closed) {
                    val line = reader.readLine() ?: break
                    if (line.isEmpty()) {
                        dispatchEvent()
                        continue
                    }
                    if (line.startsWith(':')) continue

                    val separator = line.indexOf(':')
                    val field = if (separator >= 0) line.substring(0, separator) else line
                    var value = if (separator >= 0) line.substring(separator + 1) else ""
                    if (value.startsWith(' ')) value = value.substring(1)

                    when (field) {
                        "event" -> eventName = value
                        "data" -> {
                            if (data.isNotEmpty()) data.append('\n')
                            data.append(value)
                        }
                    }
                }

                dispatchEvent()
            }
        } finally {
            if (activeConnection === connection) activeConnection = null
            connection.disconnect()
        }
    }

    companion object {
        fun parseEvent(name: String?, data: String): StingGoReloadEvent? {
            if (name != "ready" && name != "reload") return null
            val version = JSONObject(data).getLong("version")
            require(version >= 0) { "Sting Go reload version must be non-negative" }
            return StingGoReloadEvent(name = name, version = version)
        }
    }
}
