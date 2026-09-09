package run.stingjs.go

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.net.ServerSocket
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGoReloadClientInstrumentedTest {
    @Test
    fun reconnectsAndDeliversReadyThenReload() {
        val server = ServerSocket(0)
        val serverExecutor = Executors.newSingleThreadExecutor()
        val events = Collections.synchronizedList(mutableListOf<StingGoReloadEvent>())
        val received = CountDownLatch(2)

        serverExecutor.execute {
            try {
                listOf(
                    "event: ready\ndata: {\"version\":2}\n\n",
                    "event: reload\ndata: {\"version\":3}\n\n",
                ).forEach { payload ->
                    server.accept().use { socket ->
                        val reader = socket.getInputStream().bufferedReader()
                        while (true) {
                            val line = reader.readLine() ?: break
                            if (line.isEmpty()) break
                        }
                        socket.getOutputStream().bufferedWriter().use { writer ->
                            writer.write("HTTP/1.1 200 OK\r\n")
                            writer.write("Content-Type: text/event-stream\r\n")
                            writer.write("Connection: close\r\n")
                            writer.write("\r\n")
                            writer.write(payload)
                            writer.flush()
                        }
                    }
                }
            } finally {
                server.close()
            }
        }

        val client = StingGoReloadClient(
            endpointUrl = "http://127.0.0.1:${server.localPort}/events",
            onEvent = { event ->
                events.add(event)
                received.countDown()
            },
            initialReconnectDelayMs = 25,
            maxReconnectDelayMs = 50,
        )

        try {
            client.start()
            assertTrue("reload client did not reconnect in time", received.await(5, TimeUnit.SECONDS))
            assertEquals(
                listOf(
                    StingGoReloadEvent("ready", 2),
                    StingGoReloadEvent("reload", 3),
                ),
                events.toList(),
            )
        } finally {
            client.close()
            server.close()
            serverExecutor.shutdownNow()
        }
    }
}
