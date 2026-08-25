package run.stingjs.runtime

import android.content.Context
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingNodeRegistryInstrumentedTest {
    @Test
    fun realViewsUseFineGrainedTextMutationAndNativePressEvent() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val root = LinearLayout(context)
            val nodes = StingNodeRegistry(root)
            val bridge = StingNativeBridge(nodes)

            bridge.createElement(1, "view")
            bridge.createElement(2, "text")
            bridge.createTextNode(3, "Count: 0")
            bridge.insertNode(2, 3, -1)
            bridge.createElement(4, "button")
            bridge.createTextNode(5, "Add")
            bridge.insertNode(4, 5, -1)
            bridge.insertNode(1, 2, -1)
            bridge.insertNode(1, 4, -1)
            bridge.insertNode(0, 1, -1)

            val container = root.getChildAt(0)
            assertTrue(container is LinearLayout)
            container as LinearLayout

            val label = container.getChildAt(0)
            val button = container.getChildAt(1)
            assertTrue(label is TextView)
            assertTrue(button is Button)
            assertEquals("Count: 0", (label as TextView).text.toString())
            assertEquals("Add", (button as Button).text.toString())

            var observedEvent: Triple<Int, String, String>? = null
            nodes.eventSink = { nodeId, event, payloadJSON ->
                observedEvent = Triple(nodeId, event, payloadJSON)
            }
            bridge.setEventEnabled(4, "press", true)
            button.performClick()
            assertEquals(Triple(4, "press", "null"), observedEvent)

            bridge.resetMutationCounts()
            bridge.replaceText(3, "Count: 1")

            assertEquals("Count: 1", label.text.toString())
            assertEquals(1, bridge.mutationCounts.replaceText)
            assertEquals(0, bridge.mutationCounts.createElement)
            assertEquals(0, bridge.mutationCounts.createTextNode)
            assertEquals(0, bridge.mutationCounts.setProperty)
            assertEquals(0, bridge.mutationCounts.insertNode)
            assertEquals(0, bridge.mutationCounts.removeNode)
            assertEquals(0, bridge.mutationCounts.setEventEnabled)
        }
    }
}
