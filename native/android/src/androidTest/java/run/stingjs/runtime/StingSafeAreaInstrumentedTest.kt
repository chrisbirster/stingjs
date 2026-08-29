package run.stingjs.runtime

import android.content.Context
import android.widget.FrameLayout
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    @Test
    fun registryCreatesAndStylesSafeAreaHost() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)

        nodes.createElement(id = 1, type = "safearea")
        nodes.insertNode(parentId = 0, nodeId = 1, anchorId = -1)

        val safeArea = nodes.viewForNode(1)
        assertTrue(safeArea is StingSafeAreaLayout)
        safeArea as StingSafeAreaLayout

        nodes.setProperty(
            id = 1,
            name = "style",
            valueJSON = """
                {
                  "__stingResolved": true,
                  "paddingTop": 8,
                  "paddingRight": 8,
                  "paddingBottom": 8,
                  "paddingLeft": 8
                }
            """.trimIndent(),
        )
        safeArea.applySafeAreaInsetsForTesting(left = 2, top = 20, right = 3, bottom = 30)

        assertEquals(10, safeArea.paddingLeft)
        assertEquals(28, safeArea.paddingTop)
        assertEquals(11, safeArea.paddingRight)
        assertEquals(38, safeArea.paddingBottom)
    }
}
