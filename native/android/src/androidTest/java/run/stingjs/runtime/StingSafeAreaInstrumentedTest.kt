package run.stingjs.runtime

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingSafeAreaInstrumentedTest {
    @Test
    fun safeAreaInsetsAreAdditiveWithContentPadding() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val view = StingSafeAreaLayout(context)

        view.setContentPadding(left = 4, top = 5, right = 6, bottom = 7)
        view.applySafeAreaInsetsForTesting(left = 10, top = 20, right = 30, bottom = 40)

        assertEquals(14, view.paddingLeft)
        assertEquals(25, view.paddingTop)
        assertEquals(36, view.paddingRight)
        assertEquals(47, view.paddingBottom)

        // A later reactive style update must preserve the current system insets.
        view.setContentPadding(left = 1, top = 2, right = 3, bottom = 4)
        assertEquals(11, view.paddingLeft)
        assertEquals(22, view.paddingTop)
        assertEquals(33, view.paddingRight)
        assertEquals(44, view.paddingBottom)
    }
}
