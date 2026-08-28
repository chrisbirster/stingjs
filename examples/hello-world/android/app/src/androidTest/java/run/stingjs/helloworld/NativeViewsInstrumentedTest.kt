package run.stingjs.helloworld

import android.content.Context
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeView
import run.stingjs.runtime.StingNativeViewEventEmitter
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

@RunWith(AndroidJUnit4::class)
class NativeViewsInstrumentedTest {
    private class PreviewView(context: Context) : StingNativeView {
        override val view = FrameLayout(context)
        val attachedCount = AtomicInteger(0)
        val detachedCount = AtomicInteger(0)
        val disposedCount = AtomicInteger(0)
        val mode = AtomicReference<String?>()
        private var readyEmitter: StingNativeViewEventEmitter? = null
        private var disposed = false

        override fun setProperty(name: String, value: Any?) {
            when (name) {
                "mode" -> mode.set(value as? String)
                else -> throw StingNativeModuleError(
                    code = "E_VIEW_PROPERTY_NOT_FOUND",
                    message = "Preview does not implement property $name",
                )
            }
        }

        override fun setEventEnabled(
            event: String,
            enabled: Boolean,
            emit: StingNativeViewEventEmitter,
        ) {
            if (event != "ready") {
                throw StingNativeModuleError(
                    code = "E_VIEW_EVENT_NOT_FOUND",
                    message = "Preview does not implement event $event",
                )
            }
            readyEmitter = if (enabled) emit else null
        }

        override fun didAttach() {
            attachedCount.incrementAndGet()
        }

        override fun didDetach() {
            detachedCount.incrementAndGet()
        }

        override fun dispose() {
            if (disposed) return
            disposed = true
            readyEmitter = null
            disposedCount.incrementAndGet()
        }

        fun emitReady(value: Int) {
            readyEmitter?.invoke(mapOf("value" to value))
        }
    }

    private class ViewTestModule : StingNativeModule {
        override val name = "ViewTest"
        override val version = "0.1.0"
        val preview = AtomicReference<PreviewView?>()

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
            return PreviewView(context).also(preview::set)
        }
    }

    @Test
    fun officialQuickJsCreatesRoutesAndDisposesNativeModuleViews() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val runtimeRef = AtomicReference<OfficialQuickJsCandidateRuntime?>()
        val nodesRef = AtomicReference<StingNodeRegistry?>()
        val module = ViewTestModule()

        try {
            scenario.onActivity { activity ->
                val root = LinearLayout(activity)
                val nodes = StingNodeRegistry(root)
                val bridge = StingNativeBridge(
                    nodes = nodes,
                    modules = StingModuleRegistry(listOf(module)),
                )
                val runtime = OfficialQuickJsCandidateRuntime(bridge)
                nodes.eventSink = runtime::dispatchEvent
                nodesRef.set(nodes)
                runtimeRef.set(runtime)

                runtime.evaluate(
                    """
                    globalThis.__stingViewEventCount = 0;
                    globalThis.__stingViewLastValue = null;
                    globalThis.__stingDispatchEvent = function(nodeId, event, payloadJSON) {
                      if (nodeId === 2 && event === "ready") {
                        const payload = JSON.parse(payloadJSON);
                        globalThis.__stingViewEventCount += 1;
                        globalThis.__stingViewLastValue = payload.value;
                      }
                    };

                    globalThis.__stingNativeBridge.createElement(1, "view");
                    globalThis.__stingNativeBridge.createElement(
                      2,
                      "__sting_module_view__:ViewTest:Preview"
                    );
                    globalThis.__stingNativeBridge.setProperty(
                      2,
                      "mode",
                      JSON.stringify("portrait")
                    );
                    globalThis.__stingNativeBridge.setEventEnabled(2, "ready", true);
                    globalThis.__stingNativeBridge.insertNode(0, 1, -1);
                    globalThis.__stingNativeBridge.insertNode(1, 2, -1);
                    """.trimIndent(),
                )

                val preview = module.preview.get()!!
                assertEquals("portrait", preview.mode.get())
                assertEquals(1, preview.attachedCount.get())
                preview.emitReady(1)

                runtime.evaluate(
                    """
                    if (globalThis.__stingViewEventCount !== 1 || globalThis.__stingViewLastValue !== 1) {
                      throw new Error("attached native module view did not dispatch through QuickJS");
                    }
                    globalThis.__stingNativeBridge.removeNode(1, 2);
                    """.trimIndent(),
                )

                assertEquals(1, preview.detachedCount.get())
                assertNull(preview.view.parent)
                preview.emitReady(2)

                runtime.evaluate(
                    """
                    if (globalThis.__stingViewEventCount !== 1) {
                      throw new Error("detached native module view emitted a ghost event");
                    }
                    globalThis.__stingNativeBridge.insertNode(1, 2, -1);
                    """.trimIndent(),
                )

                assertEquals(2, preview.attachedCount.get())
                preview.emitReady(3)
                runtime.evaluate(
                    """
                    if (globalThis.__stingViewEventCount !== 2 || globalThis.__stingViewLastValue !== 3) {
                      throw new Error("reattached native module view did not resume event dispatch");
                    }
                    """.trimIndent(),
                )

                runtimeRef.getAndSet(null)!!.close()
                nodesRef.set(null)
            }

            val preview = module.preview.get()!!
            assertEquals(2, preview.detachedCount.get())
            assertEquals(1, preview.disposedCount.get())
            assertNull(preview.view.parent)
        } finally {
            scenario.onActivity {
                runtimeRef.getAndSet(null)?.close()
                nodesRef.set(null)
            }
            scenario.close()
        }
    }
}
