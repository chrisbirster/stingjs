package __ANDROID_PACKAGE__

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import run.stingjs.runtime.StingApplicationLifecycleEvent
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

class MainActivity : Activity() {
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
        bridge = StingNativeBridge(nodes = nodes, modules = StingModuleRegistry())
        val bundleSource = assets.open("sting-app.js").bufferedReader().use { it.readText() }
        check(bundleSource.isNotBlank()) { "sting-app.js is empty" }

        runtime = OfficialQuickJsCandidateRuntime(bridge)
        nodes.eventSink = runtime::dispatchEvent
        runtime.evaluate(bundleSource)
    }

    override fun onStart() {
        super.onStart()
        if (::bridge.isInitialized) {
            bridge.dispatchLifecycle(StingApplicationLifecycleEvent.FOREGROUND)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::bridge.isInitialized) {
            bridge.dispatchLifecycle(StingApplicationLifecycleEvent.ACTIVE)
        }
    }

    override fun onPause() {
        if (::bridge.isInitialized) {
            bridge.dispatchLifecycle(StingApplicationLifecycleEvent.INACTIVE)
        }
        super.onPause()
    }

    override fun onStop() {
        if (::bridge.isInitialized) {
            bridge.dispatchLifecycle(StingApplicationLifecycleEvent.BACKGROUND)
        }
        super.onStop()
    }

    override fun onDestroy() {
        if (::nodes.isInitialized) nodes.eventSink = null
        if (::runtime.isInitialized) runtime.close()
        super.onDestroy()
    }
}
