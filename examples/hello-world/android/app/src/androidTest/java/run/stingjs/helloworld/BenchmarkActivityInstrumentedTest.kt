package run.stingjs.helloworld

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BenchmarkActivityInstrumentedTest {
    @Test
    fun officialQuickJsRunsAttachedSparseMutation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, BenchmarkActivity::class.java)

        ActivityScenario.launch<BenchmarkActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                val sparseButton = findButton(activity.window.decorView, "Update row 4,281")
                assertNotNull("official QuickJS sparse benchmark Button", sparseButton)
                assertTrue(
                    "official QuickJS sparse benchmark Button must be attached",
                    sparseButton!!.isAttachedToWindow,
                )

                activity.resetMutationCountsForTesting()
                assertTrue(
                    "official QuickJS sparse native Button should dispatch press",
                    sparseButton.performClick(),
                )
                val counts = activity.mutationCountsForTesting()
                assertEquals("official QuickJS sparse replaceText count", 1, counts.replaceText)
                assertEquals("official QuickJS sparse createElement count", 0, counts.createElement)
                assertEquals("official QuickJS sparse createTextNode count", 0, counts.createTextNode)
                assertEquals("official QuickJS sparse setProperty count", 0, counts.setProperty)
                assertEquals("official QuickJS sparse insertNode count", 0, counts.insertNode)
                assertEquals("official QuickJS sparse removeNode count", 0, counts.removeNode)
                assertEquals("official QuickJS sparse setEventEnabled count", 0, counts.setEventEnabled)
            }
        }
    }

    private fun findButton(root: View, text: String): Button? {
        if (root is Button && root.text?.toString() == text) return root
        if (root !is ViewGroup) return null
        for (index in 0 until root.childCount) {
            val match = findButton(root.getChildAt(index), text)
            if (match != null) return match
        }
        return null
    }
}
