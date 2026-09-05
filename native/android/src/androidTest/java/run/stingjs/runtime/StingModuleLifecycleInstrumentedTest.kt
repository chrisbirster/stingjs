package run.stingjs.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingModuleLifecycleInstrumentedTest {
    private class LifecycleModule(
        override val name: String,
        private val sharedEvents: MutableList<String> = mutableListOf(),
    ) : StingNativeModule {
        override val version = "0.1.0"
        val events = mutableListOf<StingApplicationLifecycleEvent>()

        override fun callSync(method: String, arguments: List<Any?>): Any? = null

        override fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {
            events += event
            sharedEvents += "$name:${event.name.lowercase()}"
        }

        override fun handleBackgroundEvent(
            name: String,
            payload: Any?,
            completion: StingNativeModuleCompletion,
        ) {
            if (name != "refresh") {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError("E_BACKGROUND_EVENT_NOT_FOUND", "unsupported"),
                    ),
                )
                return
            }
            completion(
                StingNativeModuleResult.Success(
                    mapOf("event" to name, "payload" to payload),
                ),
            )
        }
    }

    private class DefaultLifecycleModule : StingNativeModule {
        override val name = "DefaultLifecycle"
        override val version = "0.1.0"
        override fun callSync(method: String, arguments: List<Any?>): Any? = null
    }

    @Test
    fun lifecycleDispatchIsOrderedAndRuntimeDisposingIsOneShot() {
        val shared = mutableListOf<String>()
        val first = LifecycleModule("First", shared)
        val second = LifecycleModule("Second", shared)
        val registry = StingModuleRegistry(listOf(first, second))

        registry.dispatchLifecycle(StingApplicationLifecycleEvent.FOREGROUND)
        registry.dispatchLifecycle(StingApplicationLifecycleEvent.ACTIVE)
        registry.dispose()
        registry.dispose()
        registry.dispatchLifecycle(StingApplicationLifecycleEvent.BACKGROUND)

        assertEquals(
            listOf(
                "First:foreground",
                "Second:foreground",
                "First:active",
                "Second:active",
                "First:runtime_disposing",
                "Second:runtime_disposing",
            ),
            shared,
        )
        assertEquals(StingApplicationLifecycleEvent.RUNTIME_DISPOSING, first.events.last())
        assertEquals(StingApplicationLifecycleEvent.RUNTIME_DISPOSING, second.events.last())
    }

    @Test
    fun backgroundDeliveryUsesStablePortableErrors() {
        val lifecycle = LifecycleModule("Lifecycle")
        val registry = StingModuleRegistry(listOf(lifecycle, DefaultLifecycleModule()))

        var success: Map<*, *>? = null
        registry.deliverBackgroundEvent("Lifecycle", "refresh", "payload") { result ->
            if (result is StingNativeModuleResult.Success) success = result.value as? Map<*, *>
        }
        assertEquals("refresh", success?.get("event"))
        assertEquals("payload", success?.get("payload"))

        var unsupported: StingNativeModuleError? = null
        registry.deliverBackgroundEvent("DefaultLifecycle", "refresh", null) { result ->
            if (result is StingNativeModuleResult.Failure) {
                unsupported = result.error as? StingNativeModuleError
            }
        }
        assertEquals("E_BACKGROUND_EVENT_NOT_FOUND", unsupported?.code)

        registry.dispose()
        var disposed: StingNativeModuleError? = null
        registry.deliverBackgroundEvent("Lifecycle", "refresh", null) { result ->
            if (result is StingNativeModuleResult.Failure) {
                disposed = result.error as? StingNativeModuleError
            }
        }
        assertEquals("E_RUNTIME_DISPOSED", disposed?.code)
        assertTrue(lifecycle.events.contains(StingApplicationLifecycleEvent.RUNTIME_DISPOSING))
    }
}
