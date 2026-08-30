package run.stingjs.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingModulePermissionInstrumentedTest {
    private class PermissionModule : StingNativeModule {
        override val name = "PermissionModule"
        override val version = "0.1.0"
        val requested = mutableListOf<String>()

        override fun callSync(method: String, arguments: List<Any?>): Any? = null

        override fun permissionStatus(permission: String): StingPermissionStatus {
            if (permission != "camera") {
                throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "unsupported")
            }
            return StingPermissionStatus.LIMITED
        }

        override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
            requested += permission
            if (permission != "camera") {
                completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "unsupported")))
                return
            }
            completion(Result.success(StingPermissionStatus.GRANTED))
        }
    }

    private class DefaultModule : StingNativeModule {
        override val name = "DefaultModule"
        override val version = "0.1.0"
        override fun callSync(method: String, arguments: List<Any?>): Any? = null
    }

    @Test
    fun permissionStatusAndRequestUseReservedRegistryOperations() {
        val module = PermissionModule()
        val registry = StingModuleRegistry(listOf(module))

        assertEquals(
            "limited",
            registry.callSync(module.name, "__sting_permission_status", listOf("camera")),
        )

        var requestedValue: Any? = null
        registry.callAsync(
            module.name,
            "__sting_permission_request",
            listOf("camera"),
        ) { result ->
            if (result is StingNativeModuleResult.Success) requestedValue = result.value
        }
        assertEquals("granted", requestedValue)
        assertEquals(listOf("camera"), module.requested)
    }

    @Test
    fun defaultPermissionHooksReturnStableErrors() {
        val registry = StingModuleRegistry(listOf(DefaultModule()))

        val syncError = try {
            registry.callSync("DefaultModule", "__sting_permission_status", listOf("camera"))
            null
        } catch (error: StingNativeModuleError) {
            error
        }
        assertEquals("E_PERMISSION_NOT_FOUND", syncError?.code)

        var asyncError: StingNativeModuleError? = null
        registry.callAsync(
            "DefaultModule",
            "__sting_permission_request",
            listOf("camera"),
        ) { result ->
            if (result is StingNativeModuleResult.Failure) {
                asyncError = result.error as? StingNativeModuleError
            }
        }
        assertEquals("E_PERMISSION_NOT_FOUND", asyncError?.code)
    }

    @Test
    fun invalidPermissionNameIsRejectedBeforeModuleInvocation() {
        val module = PermissionModule()
        val registry = StingModuleRegistry(listOf(module))

        val error = try {
            registry.callSync(module.name, "__sting_permission_status", listOf("   "))
            null
        } catch (error: StingNativeModuleError) {
            error
        }
        assertEquals("E_INVALID_PERMISSION", error?.code)
        assertTrue(module.requested.isEmpty())
    }
}
