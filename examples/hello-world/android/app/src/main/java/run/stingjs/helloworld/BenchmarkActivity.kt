package run.stingjs.helloworld

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import run.stingjs.runtime.StingMutationCounts
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime
import run.stingjs.runtime.candidates.quickjsng.QuickJsNgCandidateRuntime

/**
 * Release benchmark host used only by the physical-device evidence collector.
 *
 * The benchmark intentionally runs inside an attached Activity so Sting and
 * the React Native baseline pay comparable Android native-view mutation and
 * invalidation costs. Engine selection remains an instrumentation concern; the
 * public Sting runtime API does not depend on this class.
 */
class BenchmarkActivity : Activity() {
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

    private lateinit var nodes: StingNodeRegistry
    private lateinit var bridge: StingNativeBridge
    private lateinit var runtime: CandidateRuntime

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val engine = intent.getStringExtra(EXTRA_ENGINE)
            ?: error("BenchmarkActivity requires $EXTRA_ENGINE")
        require(engine == ENGINE_QUICKJS || engine == ENGINE_QUICKJS_NG) {
            "Unsupported Sting benchmark engine: $engine"
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        setContentView(root)

        nodes = StingNodeRegistry(root)
        bridge = StingNativeBridge(nodes)
        runtime = when (engine) {
            ENGINE_QUICKJS -> OfficialQuickJsRuntime(bridge)
            ENGINE_QUICKJS_NG -> QuickJsNgRuntime(bridge)
            else -> error("Unsupported Sting benchmark engine: $engine")
        }
        nodes.eventSink = runtime::dispatchEvent

        val benchmarkSource = assets.open(BENCHMARK_ASSET)
            .bufferedReader()
            .use { it.readText() }
        check(benchmarkSource.isNotBlank()) { "$BENCHMARK_ASSET is empty" }
        runtime.evaluate(benchmarkSource)
        runtime.evaluate("globalThis.__stingBenchmark.mountRows();")
    }

    override fun onDestroy() {
        if (::nodes.isInitialized) nodes.eventSink = null
        if (::runtime.isInitialized) runtime.close()
        super.onDestroy()
    }

    fun resetMutationCountsForTesting() {
        bridge.resetMutationCounts()
    }

    fun mutationCountsForTesting(): StingMutationCounts = bridge.mutationCounts.copy()

    companion object {
        const val EXTRA_ENGINE = "stingEngine"
        const val ENGINE_QUICKJS = "quickjs"
        const val ENGINE_QUICKJS_NG = "quickjs-ng"
        private const val BENCHMARK_ASSET = "sting-benchmark.js"
    }
}
