package run.stingjs.go

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGoManifestInstrumentedTest {
    @Test
    fun parsesCompatibleManifestWithReportEndpoint() {
        val manifest = StingGoManifest.parse(
            """
            {
              "schemaVersion": 1,
              "runtimeVersion": "0.1.0",
              "engine": "quickjs",
              "project": {"name": "demo"},
              "bundle": {"path": "/bundle", "contentType": "application/javascript"},
              "development": {
                "reload": {"path": "/events", "transport": "sse", "contentType": "text/event-stream"},
                "health": {"path": "/health", "contentType": "application/json"},
                "report": {"path": "/report", "method": "POST", "contentType": "application/json"}
              },
              "capabilities": ["haptics", "clipboard"]
            }
            """.trimIndent(),
        )

        assertEquals("demo", manifest.projectName)
        assertEquals("/bundle", manifest.bundlePath)
        assertEquals("/events", manifest.reloadPath)
        assertEquals("/health", manifest.healthPath)
        assertEquals("/report", manifest.reportPath)
        assertEquals(setOf("haptics", "clipboard"), manifest.capabilities)
    }

    @Test
    fun acceptsOlderV1ManifestWithoutReportEndpoint() {
        val manifest = StingGoManifest.parse(
            """
            {
              "schemaVersion": 1,
              "runtimeVersion": "0.1.0",
              "engine": "quickjs",
              "project": {"name": "demo"},
              "bundle": {"path": "/bundle", "contentType": "application/javascript"},
              "development": {
                "reload": {"path": "/events", "transport": "sse", "contentType": "text/event-stream"},
                "health": {"path": "/health", "contentType": "application/json"}
              },
              "capabilities": []
            }
            """.trimIndent(),
        )

        assertNull(manifest.reportPath)
    }

    @Test
    fun rejectsWrongEngine() {
        val failure = runCatching {
            StingGoManifest.parse(
                """
                {
                  "schemaVersion": 1,
                  "runtimeVersion": "0.1.0",
                  "engine": "quickjs-ng",
                  "project": {"name": "demo"},
                  "bundle": {"path": "/bundle", "contentType": "application/javascript"},
                  "development": {
                    "reload": {"path": "/events", "transport": "sse", "contentType": "text/event-stream"},
                    "health": {"path": "/health", "contentType": "application/json"}
                  },
                  "capabilities": []
                }
                """.trimIndent(),
            )
        }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
        assertTrue(failure?.message.orEmpty().contains("quickjs"))
    }

    @Test
    fun rejectsUnsupportedReloadTransport() {
        val failure = runCatching {
            StingGoManifest.parse(
                """
                {
                  "schemaVersion": 1,
                  "runtimeVersion": "0.1.0",
                  "engine": "quickjs",
                  "project": {"name": "demo"},
                  "bundle": {"path": "/bundle", "contentType": "application/javascript"},
                  "development": {
                    "reload": {"path": "/events", "transport": "websocket", "contentType": "text/event-stream"},
                    "health": {"path": "/health", "contentType": "application/json"}
                  },
                  "capabilities": []
                }
                """.trimIndent(),
            )
        }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
        assertTrue(failure?.message.orEmpty().contains("reload transport"))
    }
}
