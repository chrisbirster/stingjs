package run.stingjs.helloworld

import android.content.Context
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import run.stingjs.modules.clipboard.ClipboardModule
import run.stingjs.runtime.StingModuleRegistry

@RunWith(AndroidJUnit4::class)
class ModulesInstrumentedTest {
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
}
