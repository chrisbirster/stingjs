package __ANDROID_PACKAGE__

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

class MainActivity : Activity() {
    private lateinit var nodes: StingNodeRegistry
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
        val bridge = StingNativeBridge(nodes = nodes, modules = StingModuleRegistry())
        val bundleSource = assets.open("sting-app.js").bufferedReader().use { it.readText() }
        check(bundleSource.isNotBlank()) { "sting-app.js is empty" }

        runtime = OfficialQuickJsCandidateRuntime(bridge)
        nodes.eventSink = runtime::dispatchEvent
        runtime.evaluate(bundleSource)
    }

    override fun onDestroy() {
        if (::nodes.isInitialized) nodes.eventSink = null
        if (::runtime.isInitialized) runtime.close()
        super.onDestroy()
    }
}
