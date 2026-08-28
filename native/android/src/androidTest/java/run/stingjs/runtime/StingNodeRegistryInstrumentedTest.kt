package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingNodeRegistryInstrumentedTest {
    private class PreviewView(context: Context) : StingNativeView {
        override val view = FrameLayout(context)
        var attachedCount = 0
        var detachedCount = 0
        var disposedCount = 0
        val properties = mutableMapOf<String, Any?>()
        private val emitters = mutableMapOf<String, StingNativeViewEventEmitter>()
        private var disposed = false

        override fun setProperty(name: String, value: Any?) {
            properties[name] = value
        }

        override fun setEventEnabled(
            event: String,
            enabled: Boolean,
            emit: StingNativeViewEventEmitter,
        ) {
            if (enabled) {
                emitters[event] = emit
            } else {
                emitters.remove(event)
            }
        }

        override fun didAttach() {
            attachedCount += 1
        }

        override fun didDetach() {
            detachedCount += 1
        }

        override fun dispose() {
            if (disposed) return
            disposed = true
            disposedCount += 1
            emitters.clear()
        }

        fun emit(event: String, payload: Any?) {
            emitters[event]?.invoke(payload)
        }
    }

    private class ViewTestModule : StingNativeModule {
        override val name = "ViewTest"
        override val version = "0.1.0"
        val created = mutableListOf<PreviewView>()

        override fun callSync(method: String, arguments: List<Any?>): Any? {
            throw StingNativeModuleError(
                code = "E_METHOD_NOT_FOUND",
                message = "ViewTest exposes only native views",
            )
        }

        override fun createView(type: String, context: Context): StingNativeView {
            if (type != "Preview") {
                throw StingNativeModuleError(
                    code = "E_VIEW_TYPE_NOT_FOUND",
                    message = "Unknown native view type $type",
                )
            }
            return PreviewView(context).also(created::add)
        }
    }

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

    @Test
    fun imageTextInputAndScrollViewUseRealAndroidControls() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val root = LinearLayout(context)
            val nodes = StingNodeRegistry(root)
            val bridge = StingNativeBridge(nodes)

            bridge.createElement(1, "scrollview")
            bridge.createElement(2, "view")
            bridge.createElement(3, "image")
            bridge.createElement(4, "textinput")
            bridge.insertNode(2, 3, -1)
            bridge.insertNode(2, 4, -1)
            bridge.insertNode(1, 2, -1)
            bridge.insertNode(0, 1, -1)

            bridge.setProperty(1, "horizontal", "false")
            bridge.setProperty(3, "source", "\"android.resource://run.stingjs.helloworld/missing\"")
            bridge.setProperty(3, "resizeMode", "\"cover\"")
            bridge.setProperty(3, "accessibilityLabel", "\"Avatar\"")
            bridge.setProperty(4, "value", "\"Ada\"")
            bridge.setProperty(4, "placeholder", "\"Name\"")
            bridge.setProperty(4, "editable", "true")

            val scroll = nodes.viewForNode(1) as ViewGroup
            val image = nodes.viewForNode(3) as ImageView
            val input = nodes.viewForNode(4) as EditText

            assertEquals(ImageView.ScaleType.CENTER_CROP, image.scaleType)
            assertEquals("Avatar", image.contentDescription)
            assertEquals("Ada", input.text.toString())
            assertEquals("Name", input.hint.toString())
            assertTrue(input.isEnabled)
            assertNotNull(findDescendant(scroll, android.widget.ScrollView::class.java))

            val events = mutableListOf<Triple<Int, String, String>>()
            nodes.eventSink = { nodeId, event, payload ->
                events += Triple(nodeId, event, payload)
            }
            bridge.setEventEnabled(4, "changeText", true)
            input.setText("Grace")
            assertEquals(listOf(Triple(4, "changeText", "\"Grace\"")), events)

            // Controlled property updates suppress native change callbacks.
            bridge.setProperty(4, "value", "\"Lin\"")
            assertEquals("Lin", input.text.toString())
            assertEquals(1, events.size)

            bridge.setProperty(1, "horizontal", "true")
            assertNotNull(findDescendant(scroll, HorizontalScrollView::class.java))
        }
    }

    @Test
    fun nativeModuleViewsDetachReattachSuppressGhostEventsAndDisposeOnce() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val root = LinearLayout(context)
            val nodes = StingNodeRegistry(root)
            val module = ViewTestModule()
            val bridge = StingNativeBridge(
                nodes = nodes,
                modules = StingModuleRegistry(listOf(module)),
            )
            val events = mutableListOf<Triple<Int, String, String>>()
            nodes.eventSink = { nodeId, event, payload ->
                events += Triple(nodeId, event, payload)
            }

            bridge.createElement(1, "view")
            bridge.createElement(2, "__sting_module_view__:ViewTest:Preview")
            bridge.setProperty(2, "mode", "\"portrait\"")
            bridge.setEventEnabled(2, "ready", true)
            bridge.insertNode(0, 1, -1)
            bridge.insertNode(1, 2, -1)

            val preview = module.created.single()
            assertEquals("portrait", preview.properties["mode"])
            assertEquals(1, preview.attachedCount)
            assertEquals(0, preview.detachedCount)
            assertNotNull(preview.view.parent)

            preview.emit("ready", mapOf("value" to 1))
            assertEquals(1, events.size)

            bridge.removeNode(1, 2)
            assertEquals(1, preview.detachedCount)
            assertNull(preview.view.parent)

            preview.emit("ready", mapOf("value" to 2))
            assertEquals("Detached native view emitted a ghost JS event", 1, events.size)

            bridge.insertNode(1, 2, -1)
            assertEquals(2, preview.attachedCount)
            preview.emit("ready", mapOf("value" to 3))
            assertEquals(2, events.size)
            assertEquals(Triple(2, "ready", "{\"value\":3}"), events.last())

            bridge.disposeNativeViews()
            assertEquals(2, preview.detachedCount)
            assertEquals(1, preview.disposedCount)
            assertNull(preview.view.parent)

            bridge.disposeNativeViews()
            assertEquals(1, preview.disposedCount)
        }
    }

    private fun <T : View> findDescendant(root: View, type: Class<T>): T? {
        if (type.isInstance(root)) return type.cast(root)
        if (root !is ViewGroup) return null
        for (index in 0 until root.childCount) {
            val match = findDescendant(root.getChildAt(index), type)
            if (match != null) return match
        }
        return null
    }
}
