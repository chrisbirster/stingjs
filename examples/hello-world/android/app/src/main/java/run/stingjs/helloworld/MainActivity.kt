package run.stingjs.helloworld

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import run.stingjs.modules.haptics.HapticsModule
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry

class MainActivity : Activity() {
    private lateinit var nodes: StingNodeRegistry
    private lateinit var bridge: StingNativeBridge
    private lateinit var bundleSource: String

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
        bridge = StingNativeBridge(
            nodes = nodes,
            modules = StingModuleRegistry(listOf(HapticsModule(this))),
        )

        bundleSource = assets.open("sting-app.js").bufferedReader().use { it.readText() }
        check(bundleSource.isNotBlank()) { "sting-app.js is empty" }
    }
}
