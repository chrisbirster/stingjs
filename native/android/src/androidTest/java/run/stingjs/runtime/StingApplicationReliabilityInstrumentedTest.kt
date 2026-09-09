package run.stingjs.runtime

import android.content.Context
import android.widget.FrameLayout
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingApplicationReliabilityInstrumentedTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun repeatedApplicationFrameworkTeardownSuppressesLateEvents() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            repeat(50) { cycle ->
                val root = FrameLayout(context)
                val nodes = StingNodeRegistry(root)
                val events = mutableListOf<String>()
                nodes.eventSink = { id, event, _ -> events += "$id:$event" }

                nodes.createElement(1, "approot")
                nodes.insertNode(0, 1, -1)
                nodes.setEventEnabled(1, "appear", true)
                nodes.setEventEnabled(1, "disappear", true)
                nodes.setEventEnabled(1, "appStateChange", true)
                val appRoot = nodes.viewForNode(1) as StingAppRootLayout

                nodes.createElement(2, "focusview")
                nodes.insertNode(0, 2, -1)
                nodes.setEventEnabled(2, "focus", true)
                nodes.setEventEnabled(2, "blur", true)
                val focus = nodes.viewForNode(2) as StingFocusLayout

                nodes.createElement(3, "gestureview")
                nodes.insertNode(0, 3, -1)
                nodes.setEventEnabled(3, "tap", true)
                val gesture = nodes.viewForNode(3) as StingGestureLayout

                nodes.createElement(4, "modal")
                nodes.insertNode(0, 4, -1)
                nodes.setEventEnabled(4, "dismiss", true)
                nodes.setProperty(4, "presented", "true")
                val modal = nodes.viewForNode(4) as StingPresentationHostView

                nodes.createElement(5, "virtuallist")
                nodes.insertNode(0, 5, -1)
                nodes.setProperty(5, "itemExtent", "20")
                nodes.setProperty(5, "overscan", "1")
                repeat(20) { index ->
                    val id = 100 + index
                    nodes.createElement(id, "view")
                    nodes.insertNode(5, id, -1)
                }
                val list = nodes.viewForNode(5) as StingVirtualListView
                val extentPx = (20f * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)

                appRoot.emitAppearForTesting(true)
                appRoot.emitStateForTesting("background")
                appRoot.emitAppearForTesting(false)
                focus.emitFocusForTesting(true)
                focus.emitFocusForTesting(false)
                gesture.emitForTesting("tap", mapOf("x" to 1.0, "y" to 1.0, "touches" to 1))
                modal.simulateDismissForTesting()
                list.updateViewportForTesting(offsetPx = extentPx * 5, heightPx = extentPx * 2)

                assertTrue("cycle $cycle should mount a virtualized window", list.activeIndicesForTesting().isNotEmpty())
                assertTrue("cycle $cycle should emit framework events before disposal", events.size >= 7)
                val eventCountAtDispose = events.size

                nodes.dispose()
                nodes.dispose()

                appRoot.emitAppearForTesting(true)
                appRoot.emitStateForTesting("active")
                focus.emitFocusForTesting(true)
                gesture.emitForTesting("tap", mapOf("x" to 2.0, "y" to 2.0, "touches" to 1))
                modal.simulateDismissForTesting()
                list.updateViewportForTesting(offsetPx = 0, heightPx = extentPx * 2)

                assertEquals(
                    "cycle $cycle must suppress late events after registry disposal",
                    eventCountAtDispose,
                    events.size,
                )
                assertTrue(
                    "cycle $cycle must clear virtual-list attachment state during disposal",
                    list.activeIndicesForTesting().isEmpty(),
                )
            }
        }
    }
}
