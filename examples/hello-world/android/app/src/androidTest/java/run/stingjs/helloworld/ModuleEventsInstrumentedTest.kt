package run.stingjs.helloworld

import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

@RunWith(AndroidJUnit4::class)
class ModuleEventsInstrumentedTest {
    private class EventTestModule(
        private val deliveryQueued: CountDownLatch,
    ) : StingNativeModule {
        override val name = "EventTest"
        override val version = "0.1.0"

        val emittedOffMainThread = AtomicBoolean(false)
        private var retainedEmitter: ((Any?) -> Unit)? = null

        override fun callSync(method: String, arguments: List<Any?>): Any? {
            throw StingNativeModuleError(
                code = "E_SYNC_UNSUPPORTED",
                message = "EventTest exposes events only",
            )
        }

        override fun setEventEnabled(
            event: String,
            enabled: Boolean,
            emit: (Any?) -> Unit,
        ) {
            if (event != "change") {
                throw StingNativeModuleError(
                    code = "E_EVENT_NOT_FOUND",
                    message = "EventTest does not implement event $event",
                )
            }

            if (enabled) {
                retainedEmitter = emit
                Thread {
                    emittedOffMainThread.set(Looper.myLooper() !== Looper.getMainLooper())
                    emit(mapOf("text" to "android-event"))

                    // StingNativeBridge queues the QuickJS delivery onto the
                    // owner Looper before this marker is queued by the worker.
                    Handler(Looper.getMainLooper()).post {
                        deliveryQueued.countDown()
                    }
                }.start()
            } else {
                // Deliberately emit through the old callback while disable is
                // in progress. The bridge removed the active observation first,
                // so this must never reach QuickJS.
                retainedEmitter?.invoke(mapOf("text" to "late-should-be-ignored"))
                retainedEmitter = null
            }
        }
    }

    @Test
    fun backgroundModuleEventReturnsToOwningQuickJsLooperAndLateEventIsIgnored() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val runtimeRef = AtomicReference<OfficialQuickJsCandidateRuntime?>()
        val moduleRef = AtomicReference<EventTestModule?>()
        val deliveryQueued = CountDownLatch(1)

        try {
            scenario.onActivity { activity ->
                val module = EventTestModule(deliveryQueued)
                moduleRef.set(module)
                val bridge = StingNativeBridge(
                    nodes = StingNodeRegistry(LinearLayout(activity)),
                    modules = StingModuleRegistry(listOf(module)),
                )
                val runtime = OfficialQuickJsCandidateRuntime(bridge)
                runtimeRef.set(runtime)

                runtime.evaluate(
                    """
                    globalThis.__stingModuleEventResult = "pending";
                    globalThis.__stingModuleEventCount = 0;
                    globalThis.__stingDispatchModuleEvent = function(module, event, payloadJSON) {
                      const payload = JSON.parse(payloadJSON);
                      globalThis.__stingModuleEventCount += 1;
                      globalThis.__stingModuleEventResult = module + ":" + event + ":" + payload.text;
                      return true;
                    };

                    const enabled = JSON.parse(
                      globalThis.__stingNativeBridge.setModuleEventEnabled("EventTest", "change", true)
                    );
                    if (!enabled.ok) {
                      throw new Error("unable to enable EventTest.change: " + enabled.error.code);
                    }
                    """.trimIndent(),
                )
            }

            assertTrue(
                "Native module event should be queued through the owner Looper",
                deliveryQueued.await(2, TimeUnit.SECONDS),
            )
            assertTrue(moduleRef.get()!!.emittedOffMainThread.get())

            scenario.onActivity {
                runtimeRef.get()!!.evaluate(
                    """
                    if (globalThis.__stingModuleEventResult !== "EventTest:change:android-event") {
                      throw new Error("unexpected module event: " + globalThis.__stingModuleEventResult);
                    }
                    if (globalThis.__stingModuleEventCount !== 1) {
                      throw new Error("unexpected module event count before disable");
                    }

                    const disabled = JSON.parse(
                      globalThis.__stingNativeBridge.setModuleEventEnabled("EventTest", "change", false)
                    );
                    if (!disabled.ok) {
                      throw new Error("unable to disable EventTest.change: " + disabled.error.code);
                    }
                    if (globalThis.__stingModuleEventCount !== 1) {
                      throw new Error("late module event escaped disable filtering");
                    }
                    """.trimIndent(),
                )
            }
        } finally {
            scenario.onActivity {
                runtimeRef.getAndSet(null)?.close()
            }
            scenario.close()
        }
    }
}
