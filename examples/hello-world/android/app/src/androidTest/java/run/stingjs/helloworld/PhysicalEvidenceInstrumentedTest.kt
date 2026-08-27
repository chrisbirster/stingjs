package run.stingjs.helloworld

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import androidx.test.core.app.ActivityScenario
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

@RunWith(AndroidJUnit4::class)
class PhysicalEvidenceInstrumentedTest {
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
        require(
            engine == BenchmarkActivity.ENGINE_QUICKJS ||
                engine == BenchmarkActivity.ENGINE_QUICKJS_NG,
        ) {
            "stingEngine must be quickjs or quickjs-ng"
        }

        val targetContext = instrumentation.targetContext
        val intent = Intent(targetContext, BenchmarkActivity::class.java)
            .putExtra(BenchmarkActivity.EXTRA_ENGINE, engine)

        val sparseSamples = DoubleArray(SAMPLE_COUNT)
        val denseSamples = DoubleArray(SAMPLE_COUNT)

        ActivityScenario.launch<BenchmarkActivity>(intent).use { scenario ->
            assertAttachedControl(scenario, "Update row 4,281")
            assertAttachedControl(scenario, "Update 100 rows")

            repeat(WARMUP_COUNT) {
                measurePress(scenario, "Update row 4,281", 1)
            }
            repeat(SAMPLE_COUNT) { index ->
                sparseSamples[index] = measurePress(scenario, "Update row 4,281", 1)
            }

            repeat(WARMUP_COUNT) {
                measurePress(scenario, "Update 100 rows", 100)
            }
            repeat(SAMPLE_COUNT) { index ->
                denseSamples[index] = measurePress(scenario, "Update 100 rows", 100)
            }
        }

        val document = JSONObject()
            .put("captureDocumentVersion", 1)
            .put("role", "decision-evidence")
            .put("metadata", metadata(targetContext, engine, benchmarkCommit))
            .put(
                "captures",
                JSONArray()
                    .put(measurement("sparse-10k-row-update", sparseSamples))
                    .put(measurement("dense-10k-100-row-update", denseSamples)),
            )

        val outputDirectory = File(targetContext.getExternalFilesDir(null), "sting-benchmarks")
        check(outputDirectory.mkdirs() || outputDirectory.isDirectory) {
            "Unable to create ${outputDirectory.absolutePath}"
        }
        val output = File(outputDirectory, "sting-${engine}-android.json")
        output.writeText(document.toString(2) + "\n")
        println("STING_PHYSICAL_EVIDENCE=${output.absolutePath}")
    }

    private fun assertAttachedControl(
        scenario: ActivityScenario<BenchmarkActivity>,
        text: String,
    ) {
        scenario.onActivity { activity ->
            val button = findButton(activity.window.decorView, text)
            assertNotNull("native benchmark Button $text", button)
            assertTrue("native benchmark Button $text must be attached", button!!.isAttachedToWindow)
        }
    }

    private fun measurePress(
        scenario: ActivityScenario<BenchmarkActivity>,
        buttonText: String,
        expectedReplaceText: Int,
    ): Double {
        var durationMs = Double.NaN
        scenario.onActivity { activity ->
            val button = findButton(activity.window.decorView, buttonText)
            assertNotNull("native benchmark Button $buttonText", button)
            assertTrue("benchmark native Button must be attached", button!!.isAttachedToWindow)

            activity.resetMutationCountsForTesting()
            val started = SystemClock.elapsedRealtimeNanos()
            assertTrue("benchmark native Button should dispatch press", button.performClick())
            val finished = SystemClock.elapsedRealtimeNanos()
            assertOnlyTextMutations(activity.mutationCountsForTesting(), expectedReplaceText)
            durationMs = (finished - started) / 1_000_000.0
        }
        check(durationMs.isFinite() && durationMs >= 0.0) {
            "benchmark sample did not produce a valid duration"
        }
        return durationMs
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
            .put("metric", "native-event-to-native-mutation-latency")
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
                if (engine == BenchmarkActivity.ENGINE_QUICKJS) {
                    "2026-06-04"
                } else {
                    "v0.16.1@954dc53628e36891f93c359aa60895c2ae3dac6b"
                },
            )
            .put("frameworkVersion", "StingJS 0.1.0 / Solid 2.0.0-rc.1")
            .put("displayRefreshHz", windowManager.defaultDisplay.refreshRate.toDouble())
    }

    private companion object {
        const val WARMUP_COUNT = 5
        const val SAMPLE_COUNT = 30
    }
}
