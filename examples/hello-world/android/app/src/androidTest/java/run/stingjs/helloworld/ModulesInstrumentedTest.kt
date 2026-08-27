package run.stingjs.helloworld

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.modules.clipboard.ClipboardModule
import run.stingjs.modules.device.DeviceModule
import run.stingjs.runtime.StingModuleRegistry

@RunWith(AndroidJUnit4::class)
class ModulesInstrumentedTest {
    @Test
    fun clipboardRoundTripsThroughModuleRegistry() {
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
    }

    @Test
    fun deviceReportsAndroidEnvironmentThroughModuleRegistry() {
        val modules = StingModuleRegistry(listOf(DeviceModule()))
        @Suppress("UNCHECKED_CAST")
        val info = modules.callSync("Device", "getInfo", emptyList()) as Map<String, Any?>

        assertEquals("android", info["platform"])
        assertEquals("Android", info["osName"])
        assertTrue((info["model"] as String).isNotBlank())
        assertFalse(info["isPhysicalDevice"] as Boolean)
    }
}
