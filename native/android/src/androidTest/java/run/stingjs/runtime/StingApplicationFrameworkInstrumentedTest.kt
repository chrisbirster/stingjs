package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingApplicationFrameworkInstrumentedTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test
    fun presentationHostsKeepDeclarativeStateAndDismissEvents() {
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)
        val events = mutableListOf<String>()
        nodes.eventSink = { _, event, _ -> events += event }

        nodes.createElement(1, "modal")
        nodes.insertNode(0, 1, -1)
        nodes.setEventEnabled(1, "dismiss", true)
        nodes.setProperty(1, "presented", "true")

        val modal = nodes.viewForNode(1) as StingPresentationHostView
        assertTrue(modal.isPresentedForTesting())
        modal.simulateDismissForTesting()
        assertEquals(listOf("dismiss"), events)
        assertFalse(modal.isPresentedForTesting())

        nodes.createElement(2, "sheet")
        assertEquals("sheet", (nodes.viewForNode(2) as StingPresentationHostView).kind)
    }

    @Test
    fun virtualListOnlyAttachesViewportWindowPlusOverscan() {
        val list = StingVirtualListView(context)
        val extentDp = 10f
        val extentPx = (extentDp * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
        list.setItemExtentDp(extentDp)
        list.setOverscan(1)
        repeat(10) { list.insertItem(TextView(context), it) }

        list.updateViewportForTesting(offsetPx = 0, heightPx = extentPx * 2)
        assertEquals(listOf(0, 1, 2), list.activeIndicesForTesting())

        list.updateViewportForTesting(offsetPx = extentPx * 5, heightPx = extentPx * 2)
        assertEquals(listOf(4, 5, 6, 7), list.activeIndicesForTesting())
    }

    @Test
    fun registryVirtualListTracksInsertAndRemoveWithoutChangingSolidIdentity() {
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)
        nodes.createElement(1, "virtuallist")
        nodes.insertNode(0, 1, -1)
        nodes.setProperty(1, "itemExtent", "20")
        nodes.setProperty(1, "overscan", "0")

        repeat(4) { index ->
            nodes.createElement(index + 2, "view")
            nodes.insertNode(1, index + 2, -1)
        }
        val list = nodes.viewForNode(1) as StingVirtualListView
        val extentPx = (20f * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
        list.updateViewportForTesting(offsetPx = 0, heightPx = extentPx)
        assertEquals(listOf(0), list.activeIndicesForTesting())

        nodes.removeNode(1, 2)
        list.updateViewportForTesting(offsetPx = 0, heightPx = extentPx)
        assertEquals(listOf(0), list.activeIndicesForTesting())
    }

    @Test
    fun accessibilityFocusAndLifecycleEventsUseTheSharedNodeBridge() {
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)
        val events = mutableListOf<Pair<String, String>>()
        nodes.eventSink = { _, event, payload -> events += event to payload }

        nodes.createElement(1, "focusview")
        nodes.insertNode(0, 1, -1)
        nodes.setProperty(1, "accessibilityLabel", "\"Search\"")
        nodes.setProperty(1, "accessibilityHint", "\"Opens search\"")
        nodes.setProperty(1, "accessibilityRole", "\"button\"")
        nodes.setProperty(1, "accessibilityHidden", "true")
        nodes.setProperty(1, "focusable", "true")
        nodes.setEventEnabled(1, "focus", true)
        nodes.setEventEnabled(1, "blur", true)

        val focus = nodes.viewForNode(1) as StingFocusLayout
        assertEquals("Search", focus.contentDescription)
        assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS, focus.importantForAccessibility)
        assertTrue(focus.isFocusable)
        focus.emitFocusForTesting(true)
        focus.emitFocusForTesting(false)

        nodes.createElement(2, "approot")
        nodes.insertNode(0, 2, -1)
        nodes.setEventEnabled(2, "appear", true)
        nodes.setEventEnabled(2, "disappear", true)
        nodes.setEventEnabled(2, "appStateChange", true)
        val appRoot = nodes.viewForNode(2) as StingAppRootLayout
        appRoot.emitAppearForTesting(true)
        appRoot.emitStateForTesting("background")
        appRoot.emitAppearForTesting(false)

        assertTrue(events.any { it.first == "focus" })
        assertTrue(events.any { it.first == "blur" })
        assertTrue(events.any { it.first == "appear" })
        assertTrue(events.any { it.first == "disappear" })
        assertTrue(events.any { it.first == "appStateChange" && it.second.contains("background") })
    }
}
