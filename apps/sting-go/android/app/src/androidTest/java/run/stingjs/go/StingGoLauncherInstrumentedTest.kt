package run.stingjs.go

import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingGoLauncherInstrumentedTest {
    @Test
    fun launcherShowsManifestInputAndLoadAction() {
        ActivityScenario.launch(StingGoActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val root = activity.window.decorView
                assertNotNull(root.findViewWithTag<View>("sting-go-manifest-url"))
                assertNotNull(root.findViewWithTag<View>("sting-go-load"))
            }
        }
    }
}
