package run.stingjs.helloworld

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.system.Os
import android.widget.LinearLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
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
import run.stingjs.modules.filesystem.FilesystemModule
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

    private class ObservedFilesystemModule(
        context: Context,
        private val deliveryQueued: CountDownLatch,
    ) : StingNativeModule {
        private val delegate = FilesystemModule(context)

        override val name: String = delegate.name
        override val version: String = delegate.version

        override fun callSync(method: String, arguments: List<Any?>): Any? =
            delegate.callSync(method, arguments)

        override fun callAsync(
            method: String,
            arguments: List<Any?>,
            completion: (StingNativeModuleResult) -> Unit,
        ) {
            delegate.callAsync(method, arguments) { result ->
                completion(result)

                // StingNativeBridge posts the QuickJS result to the owner
                // Looper before returning from completion. Posting our marker
                // afterward gives the test a deterministic point where that
                // result delivery has been queued ahead of the marker.
                Handler(Looper.getMainLooper()).post {
                    deliveryQueued.countDown()
                }
            }
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

    @Test
    fun filesystemRoundTripsThroughOfficialQuickJsAsyncTransport() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val runtimeRef = AtomicReference<OfficialQuickJsCandidateRuntime?>()
        val deliveryQueued = CountDownLatch(5)
        val directoryName = "sting-filesystem-${System.nanoTime()}"
        val relativeFile = "$directoryName/sample.txt"
        val context = ApplicationProvider.getApplicationContext<Context>()
        val testDirectory = File(context.cacheDir, directoryName)

        try {
            testDirectory.deleteRecursively()

            scenario.onActivity { activity ->
                val nodes = StingNodeRegistry(LinearLayout(activity))
                val bridge = StingNativeBridge(
                    nodes = nodes,
                    modules = StingModuleRegistry(
                        listOf(ObservedFilesystemModule(activity, deliveryQueued)),
                    ),
                )
                val runtime = OfficialQuickJsCandidateRuntime(bridge)
                runtimeRef.set(runtime)

                runtime.evaluate(
                    """
                    globalThis.__stingFilesystemDone = false;
                    globalThis.__stingFilesystemError = null;
                    globalThis.__stingResolveModuleCall = function(requestId, responseJSON) {
                      const response = JSON.parse(responseJSON);
                      if (!response.ok) {
                        globalThis.__stingFilesystemError = response.error.code + ":" + response.error.message;
                        return true;
                      }

                      try {
                        switch (requestId) {
                          case 101:
                            globalThis.__stingNativeBridge.callModuleAsync(
                              "Filesystem",
                              "writeText",
                              JSON.stringify(["$relativeFile", "sting-filesystem", "cache"]),
                              102
                            );
                            break;
                          case 102:
                            globalThis.__stingNativeBridge.callModuleAsync(
                              "Filesystem",
                              "readText",
                              JSON.stringify(["$relativeFile", "cache"]),
                              103
                            );
                            break;
                          case 103:
                            if (response.value !== "sting-filesystem") {
                              throw new Error("unexpected read result: " + response.value);
                            }
                            globalThis.__stingNativeBridge.callModuleAsync(
                              "Filesystem",
                              "getInfo",
                              JSON.stringify(["$relativeFile", "cache"]),
                              104
                            );
                            break;
                          case 104:
                            if (!response.value.exists || response.value.type !== "file" || response.value.size <= 0) {
                              throw new Error("unexpected filesystem info: " + JSON.stringify(response.value));
                            }
                            globalThis.__stingNativeBridge.callModuleAsync(
                              "Filesystem",
                              "delete",
                              JSON.stringify(["$relativeFile", "cache"]),
                              105
                            );
                            break;
                          case 105:
                            globalThis.__stingFilesystemDone = true;
                            break;
                          default:
                            throw new Error("unexpected filesystem request id: " + requestId);
                        }
                      } catch (error) {
                        globalThis.__stingFilesystemError = String(error && error.message ? error.message : error);
                      }
                      return true;
                    };

                    globalThis.__stingNativeBridge.callModuleAsync(
                      "Filesystem",
                      "makeDirectory",
                      JSON.stringify(["$directoryName", "cache"]),
                      101
                    );
                    """.trimIndent(),
                )
            }

            assertTrue(
                "Filesystem async operations should all complete through QuickJS",
                deliveryQueued.await(5, TimeUnit.SECONDS),
            )

            scenario.onActivity {
                runtimeRef.get()!!.evaluate(
                    """
                    if (globalThis.__stingFilesystemError !== null) {
                      throw new Error("filesystem async failure: " + globalThis.__stingFilesystemError);
                    }
                    if (globalThis.__stingFilesystemDone !== true) {
                      throw new Error("filesystem async sequence did not finish");
                    }
                    """.trimIndent(),
                )
            }

            assertFalse(File(context.cacheDir, relativeFile).exists())
        } finally {
            testDirectory.deleteRecursively()
            scenario.onActivity {
                runtimeRef.getAndSet(null)?.close()
            }
            scenario.close()
        }
    }

    @Test
    fun filesystemRejectsTraversalOutsideAppPrivateRoot() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val module = FilesystemModule(context)
        val completion = CountDownLatch(1)
        val result = AtomicReference<StingNativeModuleResult?>()

        module.callAsync("readText", listOf("../escape.txt", "cache")) {
            result.set(it)
            completion.countDown()
        }

        assertTrue(completion.await(2, TimeUnit.SECONDS))
        val failure = result.get() as StingNativeModuleResult.Failure
        val error = failure.error as StingNativeModuleError
        assertEquals("E_INVALID_PATH", error.code)
    }

    @Test
    fun filesystemDeleteDoesNotFollowDirectorySymlinks() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val module = FilesystemModule(context)
        val suffix = System.nanoTime()
        val deletionRoot = File(context.cacheDir, "sting-delete-root-$suffix")
        val siblingRoot = File(context.cacheDir, "sting-delete-sibling-$suffix")
        val protectedFile = File(siblingRoot, "keep.txt")
        val symlink = File(deletionRoot, "linked-sibling")
        val completion = CountDownLatch(1)
        val result = AtomicReference<StingNativeModuleResult?>()

        try {
            deletionRoot.mkdirs()
            siblingRoot.mkdirs()
            protectedFile.writeText("keep-me")
            Os.symlink(siblingRoot.absolutePath, symlink.absolutePath)

            module.callAsync("delete", listOf(deletionRoot.name, "cache")) {
                result.set(it)
                completion.countDown()
            }

            assertTrue(completion.await(2, TimeUnit.SECONDS))
            assertTrue(result.get() is StingNativeModuleResult.Success)
            assertFalse(deletionRoot.exists())
            assertTrue("Deleting a tree must not follow a directory symlink", protectedFile.exists())
            assertEquals("keep-me", protectedFile.readText())
        } finally {
            deletionRoot.deleteRecursively()
            siblingRoot.deleteRecursively()
        }
    }
}
