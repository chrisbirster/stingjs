package run.stingjs.helloworld

import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingNativeObject
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

@RunWith(AndroidJUnit4::class)
class NativeObjectsInstrumentedTest {
    private class CounterObject(
        initialValue: Int,
        private val disposedCount: AtomicInteger,
        private val asyncDeliveryQueued: CountDownLatch,
    ) : StingNativeObject {
        private var value = initialValue
        private var disposed = false

        override fun callSync(method: String, arguments: List<Any?>): Any? {
            return when (method) {
                "increment" -> {
                    value += (arguments.firstOrNull() as? Number)?.toInt() ?: 1
                    value
                }
                "value" -> value
                else -> throw StingNativeModuleError(
                    code = "E_OBJECT_METHOD_NOT_FOUND",
                    message = "Counter does not implement $method",
                )
            }
        }

        override fun callAsync(
            method: String,
            arguments: List<Any?>,
            completion: StingNativeModuleCompletion,
        ) {
            if (method != "incrementLater") {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_OBJECT_METHOD_NOT_FOUND",
                            message = "Counter does not implement asynchronous method $method",
                        ),
                    ),
                )
                return
            }

            Thread {
                value += (arguments.firstOrNull() as? Number)?.toInt() ?: 1
                completion(StingNativeModuleResult.Success(value))

                // StingNativeBridge queues QuickJS completion onto the owner
                // Looper before this marker, giving the test a deterministic
                // point at which the JS resolver has already been scheduled.
                Handler(Looper.getMainLooper()).post {
                    asyncDeliveryQueued.countDown()
                }
            }.start()
        }

        override fun dispose() {
            if (disposed) return
            disposed = true
            disposedCount.incrementAndGet()
        }
    }

    private class ObjectTestModule(
        private val asyncDeliveryQueued: CountDownLatch,
    ) : StingNativeModule {
        override val name = "ObjectTest"
        override val version = "0.1.0"
        val disposedCount = AtomicInteger(0)

        override fun callSync(method: String, arguments: List<Any?>): Any? {
            throw StingNativeModuleError(
                code = "E_METHOD_NOT_FOUND",
                message = "ObjectTest exposes only native objects",
            )
        }

        override fun createObject(type: String, arguments: List<Any?>): StingNativeObject {
            if (type != "Counter") {
                throw StingNativeModuleError(
                    code = "E_OBJECT_TYPE_NOT_FOUND",
                    message = "Unknown object type $type",
                )
            }

            return CounterObject(
                initialValue = (arguments.firstOrNull() as? Number)?.toInt() ?: 0,
                disposedCount = disposedCount,
                asyncDeliveryQueued = asyncDeliveryQueued,
            )
        }
    }

    @Test
    fun officialQuickJsRoutesObjectMethodsAndReleasesAbandonedHandlesOnClose() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val runtimeRef = AtomicReference<OfficialQuickJsCandidateRuntime?>()
        val asyncDeliveryQueued = CountDownLatch(1)
        val module = ObjectTestModule(asyncDeliveryQueued)

        try {
            scenario.onActivity { activity ->
                val bridge = StingNativeBridge(
                    nodes = StingNodeRegistry(LinearLayout(activity)),
                    modules = StingModuleRegistry(listOf(module)),
                )
                val runtime = OfficialQuickJsCandidateRuntime(bridge)
                runtimeRef.set(runtime)

                runtime.evaluate(
                    """
                    function nativeResponse(responseJSON) {
                      return JSON.parse(responseJSON);
                    }
                    function nativeValue(responseJSON) {
                      const response = nativeResponse(responseJSON);
                      if (!response.ok) {
                        throw new Error(response.error.code + ":" + response.error.message);
                      }
                      return response.value;
                    }

                    globalThis.__stingObjectAsyncValue = "pending";
                    globalThis.__stingObjectAsyncCompletionCount = 0;
                    globalThis.__stingResolveModuleCall = function(requestId, responseJSON) {
                      const response = JSON.parse(responseJSON);
                      globalThis.__stingObjectAsyncCompletionCount += 1;
                      globalThis.__stingObjectAsyncValue = response.ok
                        ? response.value
                        : response.error.code;
                      return requestId === 801;
                    };

                    const first = nativeValue(globalThis.__stingNativeBridge.callModuleSync(
                      "ObjectTest",
                      "__sting_object_create",
                      "[\"Counter\",2]"
                    ));
                    const second = nativeValue(globalThis.__stingNativeBridge.callModuleSync(
                      "ObjectTest",
                      "__sting_object_create",
                      "[\"Counter\",10]"
                    ));

                    globalThis.__stingObjectSyncValue = nativeValue(
                      globalThis.__stingNativeBridge.callModuleSync(
                        "ObjectTest",
                        "__sting_object_call_sync",
                        JSON.stringify([second, "increment", 5])
                      )
                    );

                    nativeValue(globalThis.__stingNativeBridge.callModuleSync(
                      "ObjectTest",
                      "__sting_object_dispose",
                      JSON.stringify([first])
                    ));
                    globalThis.__stingObjectStaleError = nativeResponse(
                      globalThis.__stingNativeBridge.callModuleSync(
                        "ObjectTest",
                        "__sting_object_call_sync",
                        JSON.stringify([first, "value"])
                      )
                    ).error.code;

                    globalThis.__stingNativeBridge.callModuleAsync(
                      "ObjectTest",
                      "__sting_object_call_async",
                      JSON.stringify([second, "incrementLater", 3]),
                      801
                    );
                    """.trimIndent(),
                )
            }

            assertTrue(
                "Async native object completion should return through the owner QuickJS Looper",
                asyncDeliveryQueued.await(2, TimeUnit.SECONDS),
            )

            scenario.onActivity {
                runtimeRef.get()!!.evaluate(
                    """
                    if (globalThis.__stingObjectSyncValue !== 15) {
                      throw new Error("unexpected sync object value: " + globalThis.__stingObjectSyncValue);
                    }
                    if (globalThis.__stingObjectAsyncValue !== 18) {
                      throw new Error("unexpected async object value: " + globalThis.__stingObjectAsyncValue);
                    }
                    if (globalThis.__stingObjectAsyncCompletionCount !== 1) {
                      throw new Error("object async request completed more than once");
                    }
                    if (globalThis.__stingObjectStaleError !== "E_OBJECT_NOT_FOUND") {
                      throw new Error("stale object handle did not fail clearly");
                    }
                    """.trimIndent(),
                )

                runtimeRef.getAndSet(null)!!.close()
            }

            // `first` was explicitly disposed in JS. `second` was deliberately
            // abandoned and must be released by the native registry fallback in
            // OfficialQuickJsCandidateRuntime.close().
            assertEquals(2, module.disposedCount.get())
        } finally {
            scenario.onActivity {
                runtimeRef.getAndSet(null)?.close()
            }
            scenario.close()
        }
    }
}
