package run.stingjs.helloworld

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HelloWorldNativeLoopInstrumentedTest {
    @Test
    fun nativeButtonRunsSolidAndMutatesOnlyTheDependentTextNode() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)
                val countLabel = findView(content) { view ->
                    view is TextView && view !is Button && view.text.toString() == "Count: 0"
                } as? TextView
                val addButton = findView(content) { view ->
                    view is Button && view.text.toString() == "Add"
                } as? Button

                assertNotNull("real Android TextView with Count: 0 was not mounted", countLabel)
                assertNotNull("real Android Button with Add was not mounted", addButton)

                activity.resetMutationCountsForTesting()
                addButton!!.performClick()

                assertEquals("Count: 1", countLabel!!.text.toString())
                val counts = activity.mutationCountsForTesting()
                assertEquals(1, counts.replaceText)
                assertEquals(0, counts.createElement)
                assertEquals(0, counts.createTextNode)
                assertEquals(0, counts.setProperty)
                assertEquals(0, counts.insertNode)
                assertEquals(0, counts.removeNode)
                assertEquals(0, counts.setEventEnabled)
            }
        }
    }

    private fun findView(root: ViewGroup, predicate: (View) -> Boolean): View? {
        for (index in 0 until root.childCount) {
            val child = root.getChildAt(index)
            if (predicate(child)) return child
            if (child is ViewGroup) {
                val nested = findView(child, predicate)
                if (nested != null) return nested
            }
        }
        return null
    }
}
