package run.stingjs.helloworld

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.modules.clipboard.ClipboardModule
import run.stingjs.modules.device.DeviceModule
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

@RunWith(AndroidJUnit4::class)
class ModulesInstrumentedTest {
    private class AsyncTestModule(
        private val deliveryQueued: CountDownLatch,
    ) : StingNativeModule {
        override val name = "AsyncTest"
        override val version = "0.1.0"

        override fun callSync(method: String, arguments: List<Any?>): Any? {
            throw StingNativeModuleError(
                code = "E_SYNC_UNSUPPORTED",
                message = "AsyncTest is asynchronous only",
            )
        }

        override fun callAsync(
            method: String,
            arguments: List<Any?>,
            completion: (StingNativeModuleResult) -> Unit,
        ) {
            Thread {
                completion(
                    StingNativeModuleResult.Success(
                        mapOf("text" to "android-async"),
                    ),
                )
                completion(
                    StingNativeModuleResult.Success(
                        mapOf("text" to "duplicate-should-be-ignored"),
                    ),
                )

                // The first completion posts QuickJS delivery to the owner
                // Looper before this marker is posted from the same worker.
                Handler(Looper.getMainLooper()).post {
                    deliveryQueued.countDown()
                }
            }.start()
        }
    }

    @Test
    fun clipboardRoundTripsThroughModuleRegistry() {
        // Android deliberately hides clipboard reads from apps that are not the
        // default IME and do not have input focus. Launch the real host Activity
        // so this test exercises Clipboard under the same foreground lifecycle
        // an application uses instead of depending on privileged test-process
        // clipboard visibility.
        val scenario = ActivityScenario.launch(MainActivity::class.java)

        try {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val modules = StingModuleRegistry(listOf(ClipboardModule(context)))

            modules.callSync("Clipboard", "clear", emptyList())
            assertFalse(modules.callSync("Clipboard", "hasString", emptyList()) as Boolean)

            modules.callSync("Clipboard", "setString", listOf("sting-modules-sdk"))
            assertTrue(modules.callSync("Clipboard", "hasString", emptyList()) as Boolean)
            assertEquals(
                "sting-modules-sdk",
                modules.callSync("Clipboard", "getString", emptyList()) as String,
            )

            modules.callSync("Clipboard", "clear", emptyList())
            assertFalse(modules.callSync("Clipboard", "hasString", emptyList()) as Boolean)
        } finally {
            scenario.close()
        }
    }

    @Test
    fun deviceReportsAndroidEnvironmentThroughModuleRegistry() {
        val modules = StingModuleRegistry(listOf(DeviceModule()))
        @Suppress("UNCHECKED_CAST")
        val info = modules.callSync("Device", "getInfo", emptyList()) as Map<String, Any?>

        assertEquals("android", info["platform"])
        assertEquals("Android", info["osName"])
        assertTrue((info["model"] as String).isNotBlank())
        assertTrue((info["manufacturer"] as String).isNotBlank())
        assertTrue((info["osVersion"] as String).isNotBlank())
        assertFalse(info["isPhysicalDevice"] as Boolean)
    }

    @Test
    fun asyncModuleCompletionReturnsFromWorkerToOwningQuickJsLooperExactlyOnce() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val runtimeRef = AtomicReference<OfficialQuickJsCandidateRuntime?>()
        val deliveryQueued = CountDownLatch(1)

        try {
            scenario.onActivity { activity ->
                val nodes = StingNodeRegistry(LinearLayout(activity))
                val bridge = StingNativeBridge(
                    nodes = nodes,
                    modules = StingModuleRegistry(listOf(AsyncTestModule(deliveryQueued))),
                )
                val runtime = OfficialQuickJsCandidateRuntime(bridge)
                runtimeRef.set(runtime)

                runtime.evaluate(
                    """
                    globalThis.__stingAsyncResult = "pending";
                    globalThis.__stingAsyncCompletionCount = 0;
                    globalThis.__stingResolveModuleCall = function(requestId, responseJSON) {
                      const response = JSON.parse(responseJSON);
                      globalThis.__stingAsyncCompletionCount += 1;
                      globalThis.__stingAsyncResult = response.ok ? response.value.text : response.error.code;
                      return true;
                    };
                    globalThis.__stingNativeBridge.callModuleAsync("AsyncTest", "load", "[]", 73);
                    """.trimIndent(),
                )
            }

            assertTrue(
                "Async native completion should be posted through the owner Looper",
                deliveryQueued.await(2, TimeUnit.SECONDS),
            )

            scenario.onActivity {
                runtimeRef.get()!!.evaluate(
                    """
                    if (globalThis.__stingAsyncResult !== "android-async") {
                      throw new Error("unexpected async result: " + globalThis.__stingAsyncResult);
                    }
                    if (globalThis.__stingAsyncCompletionCount !== 1) {
                      throw new Error("async request completed more than once");
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
