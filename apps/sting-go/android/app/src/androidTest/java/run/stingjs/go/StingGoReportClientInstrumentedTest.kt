package run.stingjs.go

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.net.ServerSocket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGoReportClientInstrumentedTest {
    @Test
    fun postsRuntimeReportToAdvertisedEndpoint() {
        ServerSocket(0).use { server ->
            val bodyQueue = ArrayBlockingQueue<String>(1)
            val worker = thread(start = true, name = "sting-go-report-test") {
                server.accept().use { socket ->
                    val input = socket.getInputStream().bufferedReader()
                    var contentLength = 0
                    while (true) {
                        val line = input.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Content-Length:", ignoreCase = true)) {
                            contentLength = line.substringAfter(':').trim().toInt()
                        }
                    }
                    val body = CharArray(contentLength)
                    var offset = 0
                    while (offset < body.size) {
                        val read = input.read(body, offset, body.size - offset)
                        if (read < 0) break
                        offset += read
                    }
                    bodyQueue.put(String(body, 0, offset))
                    socket.getOutputStream().bufferedWriter().use { output ->
                        output.write("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
                        output.flush()
                    }
                }
            }

            StingGoReportClient.post(
                endpointUrl = "http://127.0.0.1:${server.localPort}/report",
                kind = "runtime",
                message = "ReferenceError: missingValue is not defined",
                detail = "sting-app.js:12",
            )

            val body = bodyQueue.poll(5, TimeUnit.SECONDS)
            assertNotNull(body)
            val json = JSONObject(body!!)
            assertEquals("runtime", json.getString("kind"))
            assertEquals("android", json.getString("platform"))
            assertEquals("ReferenceError: missingValue is not defined", json.getString("message"))
            assertEquals("sting-app.js:12", json.getString("detail"))
            worker.join(5_000)
        }
    }
}
