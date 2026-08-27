package run.stingjs.helloworld

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.runtime.StingMutationCounts
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime
import run.stingjs.runtime.candidates.quickjsng.QuickJsNgCandidateRuntime

@RunWith(AndroidJUnit4::class)
class PhysicalEvidenceInstrumentedTest {
    private interface CandidateRuntime : AutoCloseable {
        fun evaluate(source: String)
        fun dispatchEvent(nodeId: Int, event: String, payloadJSON: String)
    }

    private class OfficialQuickJsRuntime(bridge: StingNativeBridge) : CandidateRuntime {
        private val runtime = OfficialQuickJsCandidateRuntime(bridge)
        override fun evaluate(source: String) = runtime.evaluate(source)
        override fun dispatchEvent(nodeId: Int, event: String, payloadJSON: String) =
            runtime.dispatchEvent(nodeId, event, payloadJSON)
        override fun close() = runtime.close()
    }

    private class QuickJsNgRuntime(bridge: StingNativeBridge) : CandidateRuntime {
        private val runtime = QuickJsNgCandidateRuntime(bridge)
        override fun evaluate(source: String) = runtime.evaluate(source)
        override fun dispatchEvent(nodeId: Int, event: String, payloadJSON: String) =
            runtime.dispatchEvent(nodeId, event, payloadJSON)
        override fun close() = runtime.close()
    }

    @Test
    fun captureSparseAndDenseReleaseEvidence() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "physical evidence capture is opt-in and must not run on emulator CI",
            arguments.getString("stingPhysicalEvidence") == "1",
        )

        val engine = arguments.getString("stingEngine")
            ?: error("-e stingEngine quickjs|quickjs-ng is required")
        val benchmarkCommit = arguments.getString("benchmarkCommit")
            ?: error("-e benchmarkCommit <40-char-sha> is required")

        require(benchmarkCommit.matches(Regex("^[0-9a-f]{40}$"))) {
            "benchmarkCommit must be a full 40-character Git SHA"
        }
        require(engine == "quickjs" || engine == "quickjs-ng") {
            "stingEngine must be quickjs or quickjs-ng"
        }

        val targetContext = instrumentation.targetContext
        val benchmarkSource = targetContext.assets.open("sting-benchmark.js")
            .bufferedReader()
            .use { it.readText() }
        assertTrue("sting-benchmark.js must not be empty", benchmarkSource.isNotBlank())

        var capture: JSONObject? = null
        instrumentation.runOnMainSync {
            capture = runCandidate(
                context = targetContext,
                engine = engine,
                benchmarkCommit = benchmarkCommit,
                benchmarkSource = benchmarkSource,
            )
        }

        assertNotNull("candidate capture document should be produced", capture)
        val outputDirectory = File(targetContext.getExternalFilesDir(null), "sting-benchmarks")
        check(outputDirectory.mkdirs() || outputDirectory.isDirectory) {
            "Unable to create ${outputDirectory.absolutePath}"
        }
        val output = File(outputDirectory, "sting-${engine}-android.json")
        output.writeText(capture!!.toString(2) + "\n")
        println("STING_PHYSICAL_EVIDENCE=${output.absolutePath}")
    }

    private fun runCandidate(
        context: Context,
        engine: String,
        benchmarkCommit: String,
        benchmarkSource: String,
    ): JSONObject {
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        val nodes = StingNodeRegistry(root)
        val bridge = StingNativeBridge(nodes)
        val runtime: CandidateRuntime = when (engine) {
            "quickjs" -> OfficialQuickJsRuntime(bridge)
            "quickjs-ng" -> QuickJsNgRuntime(bridge)
            else -> error("unsupported engine: $engine")
        }

        runtime.use {
            nodes.eventSink = runtime::dispatchEvent
            runtime.evaluate(benchmarkSource)
            runtime.evaluate("globalThis.__stingBenchmark.mountRows();")

            val sparseButton = findButton(root, "Update row 4,281")
            val denseButton = findButton(root, "Update 100 rows")
            assertNotNull("native sparse benchmark Button", sparseButton)
            assertNotNull("native dense benchmark Button", denseButton)

            repeat(WARMUP_COUNT) { runMeasuredPress(sparseButton!!, bridge, 1) }
            val sparse = DoubleArray(SAMPLE_COUNT) {
                runMeasuredPress(sparseButton!!, bridge, 1)
            }

            repeat(WARMUP_COUNT) { runMeasuredPress(denseButton!!, bridge, 100) }
            val dense = DoubleArray(SAMPLE_COUNT) {
                runMeasuredPress(denseButton!!, bridge, 100)
            }

            nodes.eventSink = null
            return JSONObject()
                .put("captureDocumentVersion", 1)
                .put("role", "decision-evidence")
                .put("metadata", metadata(context, engine, benchmarkCommit))
                .put(
                    "captures",
                    JSONArray()
                        .put(measurement("sparse-10k-row-update", sparse))
                        .put(measurement("dense-10k-100-row-update", dense)),
                )
        }
    }

    private fun runMeasuredPress(
        button: Button,
        bridge: StingNativeBridge,
        expectedReplaceText: Int,
    ): Double {
        bridge.resetMutationCounts()
        val started = SystemClock.elapsedRealtimeNanos()
        assertTrue("benchmark native Button should dispatch press", button.performClick())
        val finished = SystemClock.elapsedRealtimeNanos()
        assertOnlyTextMutations(bridge.mutationCounts, expectedReplaceText)
        return (finished - started) / 1_000_000.0
    }

    private fun findButton(root: View, text: String): Button? {
        if (root is Button && root.text?.toString() == text) return root
        if (root !is ViewGroup) return null
        for (index in 0 until root.childCount) {
            val match = findButton(root.getChildAt(index), text)
            if (match != null) return match
        }
        return null
    }

    private fun assertOnlyTextMutations(counts: StingMutationCounts, expected: Int) {
        assertEquals("replaceText mutation count", expected, counts.replaceText)
        assertEquals("createElement mutation count", 0, counts.createElement)
        assertEquals("createTextNode mutation count", 0, counts.createTextNode)
        assertEquals("setProperty mutation count", 0, counts.setProperty)
        assertEquals("insertNode mutation count", 0, counts.insertNode)
        assertEquals("removeNode mutation count", 0, counts.removeNode)
        assertEquals("setEventEnabled mutation count", 0, counts.setEventEnabled)
    }

    private fun measurement(scenario: String, samples: DoubleArray): JSONObject =
        JSONObject()
            .put("scenario", scenario)
            .put("metric", "native-event-to-visible-update-latency")
            .put("unit", "ms")
            .put("direction", "lower-is-better")
            .put("samples", JSONArray().apply { samples.forEach { put(it) } })

    @Suppress("DEPRECATION")
    private fun metadata(context: Context, engine: String, benchmarkCommit: String): JSONObject {
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val recordedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        return JSONObject()
            .put("benchmarkCommit", benchmarkCommit)
            .put("recordedAt", recordedAt)
            .put("platform", "android")
            .put("environment", "physical-device")
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            .put("deviceArchitecture", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
            .put("osVersion", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            .put("build", "release")
            .put("system", "sting")
            .put("engine", engine)
            .put(
                "engineVersion",
                if (engine == "quickjs") "2026-06-04" else "v0.16.1@954dc53628e36891f93c359aa60895c2ae3dac6b",
            )
            .put("frameworkVersion", "StingJS 0.1.0 / Solid 2.0.0-rc.1")
            .put("displayRefreshHz", windowManager.defaultDisplay.refreshRate.toDouble())
    }

    private companion object {
        const val WARMUP_COUNT = 5
        const val SAMPLE_COUNT = 30
    }
}
