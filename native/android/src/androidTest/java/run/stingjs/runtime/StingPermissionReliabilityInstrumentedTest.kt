package run.stingjs.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import java.lang.ref.WeakReference

@RunWith(AndroidJUnit4::class)
class StingPermissionReliabilityInstrumentedTest {
    private class DeferredPermissionModule(
        override val name: String = "PermissionModule",
    ) : StingNativeModule {
        override val version = "0.1.0"
        val statuses = mutableMapOf("camera" to StingPermissionStatus.UNDETERMINED)
        val requested = mutableListOf<String>()
        val completions = mutableListOf<StingPermissionCompletion>()

        override fun callSync(method: String, arguments: List<Any?>): Any? = null

        override fun permissionStatus(permission: String): StingPermissionStatus =
            statuses[permission] ?: throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "unsupported")

        override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
            if (!statuses.containsKey(permission)) {
                completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "unsupported")))
                return
            }
            requested += permission
            completions += completion
        }

        fun complete(index: Int, status: StingPermissionStatus, permission: String = "camera") {
            statuses[permission] = status
            completions[index](Result.success(status))
        }
    }

    private class Consumer {
        var settled = 0
    }

    private fun errorCode(result: StingNativeModuleResult?): String? =
        ((result as? StingNativeModuleResult.Failure)?.error as? StingNativeModuleError)?.code

    @Test
    fun permissionStatusAlwaysRefreshesFromModule() {
        val module = DeferredPermissionModule()
        val registry = StingModuleRegistry(listOf(module))

        assertEquals("undetermined", registry.callSync(module.name, "__sting_permission_status", listOf("camera")))
        module.statuses["camera"] = StingPermissionStatus.GRANTED
        assertEquals("granted", registry.callSync(module.name, "__sting_permission_status", listOf("camera")))
        module.statuses["camera"] = StingPermissionStatus.DENIED
        assertEquals("denied", registry.callSync(module.name, "__sting_permission_status", listOf("camera")))
    }

    @Test
    fun deniedPermissionCanBeRequestedAgain() {
        val module = DeferredPermissionModule()
        val registry = StingModuleRegistry(listOf(module))
        var first: StingNativeModuleResult? = null
        var second: StingNativeModuleResult? = null

        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) { first = it }
        assertEquals(listOf("camera"), module.requested)
        module.complete(0, StingPermissionStatus.DENIED)
        assertEquals("denied", (first as? StingNativeModuleResult.Success)?.value)

        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) { second = it }
        assertEquals(listOf("camera", "camera"), module.requested)
        module.complete(1, StingPermissionStatus.GRANTED)
        assertEquals("granted", (second as? StingNativeModuleResult.Success)?.value)
    }

    @Test
    fun concurrentSamePermissionUsesOneNativeTransactionAndSettlesOnce() {
        val module = DeferredPermissionModule()
        val registry = StingModuleRegistry(listOf(module))
        var firstSettles = 0
        var secondSettles = 0
        var firstValue: Any? = null
        var secondValue: Any? = null

        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) { result ->
            firstSettles += 1
            firstValue = (result as? StingNativeModuleResult.Success)?.value
        }
        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) { result ->
            secondSettles += 1
            secondValue = (result as? StingNativeModuleResult.Success)?.value
        }

        assertEquals(listOf("camera"), module.requested)
        module.complete(0, StingPermissionStatus.GRANTED)
        module.complete(0, StingPermissionStatus.DENIED)
        assertEquals(1, firstSettles)
        assertEquals(1, secondSettles)
        assertEquals("granted", firstValue)
        assertEquals("granted", secondValue)
    }

    @Test
    fun concurrentRequestsForDifferentModulesStayIndependent() {
        val firstModule = DeferredPermissionModule("First")
        val secondModule = DeferredPermissionModule("Second")
        val registry = StingModuleRegistry(listOf(firstModule, secondModule))
        var firstValue: Any? = null
        var secondValue: Any? = null

        registry.callAsync(firstModule.name, "__sting_permission_request", listOf("camera")) {
            firstValue = (it as? StingNativeModuleResult.Success)?.value
        }
        registry.callAsync(secondModule.name, "__sting_permission_request", listOf("camera")) {
            secondValue = (it as? StingNativeModuleResult.Success)?.value
        }
        assertEquals(1, firstModule.requested.size)
        assertEquals(1, secondModule.requested.size)
        secondModule.complete(0, StingPermissionStatus.DENIED)
        firstModule.complete(0, StingPermissionStatus.GRANTED)
        assertEquals("granted", firstValue)
        assertEquals("denied", secondValue)
    }

    @Test
    fun disposeDrainsPendingRequestsAndSuppressesLateCompletions() {
        val module = DeferredPermissionModule()
        val registry = StingModuleRegistry(listOf(module))
        var result: StingNativeModuleResult? = null
        var settles = 0

        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) {
            settles += 1
            result = it
        }
        assertEquals(1, module.requested.size)
        registry.dispose()
        assertEquals(1, settles)
        assertEquals("E_RUNTIME_DISPOSED", errorCode(result))

        module.complete(0, StingPermissionStatus.GRANTED)
        assertEquals(1, settles)

        var afterDispose: StingNativeModuleResult? = null
        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) { afterDispose = it }
        assertEquals("E_RUNTIME_DISPOSED", errorCode(afterDispose))
        assertEquals(1, module.requested.size)
    }

    @Test
    fun oldRuntimeCompletionCannotEnterNewRuntimeGeneration() {
        val firstModule = DeferredPermissionModule()
        val firstRegistry = StingModuleRegistry(listOf(firstModule))
        var firstResult: StingNativeModuleResult? = null
        firstRegistry.callAsync(firstModule.name, "__sting_permission_request", listOf("camera")) { firstResult = it }
        firstRegistry.dispose()
        assertEquals("E_RUNTIME_DISPOSED", errorCode(firstResult))

        val secondModule = DeferredPermissionModule()
        val secondRegistry = StingModuleRegistry(listOf(secondModule))
        var secondSettles = 0
        var secondValue: Any? = null
        secondRegistry.callAsync(secondModule.name, "__sting_permission_request", listOf("camera")) {
            secondSettles += 1
            secondValue = (it as? StingNativeModuleResult.Success)?.value
        }

        firstModule.complete(0, StingPermissionStatus.GRANTED)
        assertEquals(0, secondSettles)
        secondModule.complete(0, StingPermissionStatus.DENIED)
        assertEquals(1, secondSettles)
        assertEquals("denied", secondValue)
    }

    @Test
    fun permissionResultDoesNotRetainDisappearedConsumer() {
        val module = DeferredPermissionModule()
        val registry = StingModuleRegistry(listOf(module))
        var consumer: Consumer? = Consumer()
        val weakConsumer = WeakReference(consumer)

        registry.callAsync(module.name, "__sting_permission_request", listOf("camera")) {
            weakConsumer.get()?.settled = (weakConsumer.get()?.settled ?: 0) + 1
        }
        consumer = null
        repeat(3) {
            System.gc()
            Thread.yield()
        }
        assertNull(consumer)
        module.complete(0, StingPermissionStatus.GRANTED)
    }
}
