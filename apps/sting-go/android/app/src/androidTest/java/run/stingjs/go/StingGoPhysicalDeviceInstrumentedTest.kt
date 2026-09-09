package run.stingjs.go

import android.content.Intent
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGoPhysicalDeviceInstrumentedTest {
    @Test
    fun physicalDeviceLoadsSolidBundleAndConnectsReloadStream() {
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "physical Sting Go validation is opt-in and does not run on hosted emulator CI",
            arguments.getString("stingGoPhysicalEvidence") == "1",
        )

        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val manifestUrl = arguments
            .getString("stingGoManifestUrl")
            ?.takeIf { it.isNotBlank() }
            ?: error("stingGoManifestUrl instrumentation argument is required")
        val deepLink = Uri.parse("sting://go?url=${Uri.encode(manifestUrl)}")
        val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
            setClass(instrumentation.targetContext, StingGoActivity::class.java)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }

        ActivityScenario.launch<StingGoActivity>(intent).use { scenario ->
            var renderedSolid = false
            var reloadConnected = false

            repeat(100) {
                scenario.onActivity { activity ->
                    val root = activity.window.decorView
                    renderedSolid = root.containsText("Count: 0") &&
                        root.findViewWithTag<View>("sting-go-reload") != null
                    reloadConnected = root.containsText("Live")
                }
                if (renderedSolid && reloadConnected) return@use
                Thread.sleep(200)
            }

            assertTrue(
                "Sting Go did not render the Solid hello-world bundle on the physical device",
                renderedSolid,
            )
            assertTrue(
                "Sting Go did not reach the live SSE reload state on the physical device",
                reloadConnected,
            )
        }
    }

    private fun View.containsText(expected: String): Boolean {
        if (this is TextView && text?.toString()?.contains(expected) == true) return true
        if (this is ViewGroup) {
            for (index in 0 until childCount) {
                if (getChildAt(index).containsText(expected)) return true
            }
        }
        return false
    }
}
