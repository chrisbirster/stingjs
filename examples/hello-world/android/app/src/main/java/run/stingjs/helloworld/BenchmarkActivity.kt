package run.stingjs.helloworld

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import run.stingjs.runtime.StingMutationCounts
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

/**
 * Release benchmark host used by the physical-device production evidence collector.
 *
 * The normal Sting Android application packages only official QuickJS. Historical
 * QuickJS-NG comparison code remains under runtime/prototypes/quickjs-ng and can
 * be exercised independently as research; it is not an application runtime.
 */
class BenchmarkActivity : Activity() {
    private lateinit var nodes: StingNodeRegistry
    private lateinit var bridge: StingNativeBridge
    private lateinit var runtime: OfficialQuickJsCandidateRuntime

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
        runtime = OfficialQuickJsCandidateRuntime(bridge)
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
        const val ENGINE_QUICKJS = "quickjs"
        private const val BENCHMARK_ASSET = "sting-benchmark.js"
    }
}
