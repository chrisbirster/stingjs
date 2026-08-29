package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingNavigationStackInstrumentedTest {
    @Test
    fun navigationStackShowsOnlyTopScreenAndFillsByDefault() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val navigation = StingNavigationStackLayout(context)
        val first = View(context)
        val second = View(context)

        navigation.addView(first)
        navigation.addView(second)

        assertEquals(View.GONE, first.visibility)
        assertEquals(View.VISIBLE, second.visibility)
        assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, first.layoutParams.width)
        assertEquals(ViewGroup.LayoutParams.MATCH_PARENT, first.layoutParams.height)

        var backCount = 0
        navigation.setBackHandler(true) { backCount += 1 }
        assertTrue(navigation.requestBack())
        assertEquals(1, backCount)

        navigation.removeView(second)
        assertEquals(View.VISIBLE, first.visibility)
        assertFalse(navigation.requestBack())
    }

    @Test
    fun registryRoutesBackToDeepestActiveStackThenBubbles() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)
        val events = mutableListOf<Int>()
        nodes.eventSink = { nodeId, event, _ ->
            if (event == "back") events += nodeId
        }

        // Outer stack: screen 2 is retained but hidden, screen 3 is active.
        nodes.createElement(1, "navigationstack")
        nodes.createElement(2, "view")
        nodes.createElement(3, "view")
        nodes.insertNode(0, 1, -1)
        nodes.insertNode(1, 2, -1)
        nodes.insertNode(1, 3, -1)
        nodes.setEventEnabled(1, "back", true)

        // Hidden screen owns a deeper stack that must never steal back.
        nodes.createElement(7, "navigationstack")
        nodes.createElement(8, "view")
        nodes.createElement(9, "view")
        nodes.insertNode(2, 7, -1)
        nodes.insertNode(7, 8, -1)
        nodes.insertNode(7, 9, -1)
        nodes.setEventEnabled(7, "back", true)

        // Active screen owns its own nested stack, which gets first refusal.
        nodes.createElement(4, "navigationstack")
        nodes.createElement(5, "view")
        nodes.createElement(6, "view")
        nodes.insertNode(3, 4, -1)
        nodes.insertNode(4, 5, -1)
        nodes.insertNode(4, 6, -1)
        nodes.setEventEnabled(4, "back", true)

        val outer = nodes.viewForNode(1) as StingNavigationStackLayout
        assertEquals(View.GONE, nodes.viewForNode(2)?.visibility)
        assertEquals(View.VISIBLE, nodes.viewForNode(3)?.visibility)
        assertTrue(nodes.requestBack())
        assertEquals(listOf(4), events)

        // Once the nested stack reaches its root, back bubbles to the outer stack.
        nodes.removeNode(4, 6)
        assertTrue(nodes.requestBack())
        assertEquals(listOf(4, 1), events)

        // Solid owns the actual pop. Removing the outer top reveals the retained screen.
        nodes.removeNode(1, 3)
        assertEquals(View.VISIBLE, nodes.viewForNode(2)?.visibility)
        assertEquals(1, outer.childCount)
    }

    @Test
    fun bridgeExposesHandledBackWithoutAddingRouteState() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val nodes = StingNodeRegistry(FrameLayout(context))
        val bridge = StingNativeBridge(nodes)

        nodes.createElement(1, "navigationstack")
        nodes.createElement(2, "view")
        nodes.createElement(3, "view")
        nodes.insertNode(0, 1, -1)
        nodes.insertNode(1, 2, -1)
        nodes.insertNode(1, 3, -1)
        nodes.setEventEnabled(1, "back", true)

        assertTrue(bridge.requestBack())
        nodes.removeNode(1, 3)
        assertFalse(bridge.requestBack())
    }
}
