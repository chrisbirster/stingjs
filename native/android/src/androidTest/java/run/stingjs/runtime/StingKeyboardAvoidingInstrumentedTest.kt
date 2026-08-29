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
class StingKeyboardAvoidingInstrumentedTest {
    @Test
    fun keyboardInsetIsAdditiveWithContentPadding() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val view = StingKeyboardAvoidingLayout(context)

        view.setContentPadding(left = 4, top = 5, right = 6, bottom = 7)
        view.applyKeyboardInsetForTesting(bottom = 40)

        assertEquals(4, view.paddingLeft)
        assertEquals(5, view.paddingTop)
        assertEquals(6, view.paddingRight)
        assertEquals(47, view.paddingBottom)

        view.setContentPadding(left = 1, top = 2, right = 3, bottom = 4)
        assertEquals(1, view.paddingLeft)
        assertEquals(2, view.paddingTop)
        assertEquals(3, view.paddingRight)
        assertEquals(44, view.paddingBottom)

        view.applyKeyboardInsetForTesting(bottom = 0)
        assertEquals(4, view.paddingBottom)
    }

    @Test
    fun registryCreatesAndStylesKeyboardAvoidingHost() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)

        nodes.createElement(id = 1, type = "keyboardavoidingview")
        nodes.insertNode(parentId = 0, nodeId = 1, anchorId = -1)

        val keyboardAvoiding = nodes.viewForNode(1)
        assertTrue(keyboardAvoiding is StingKeyboardAvoidingLayout)
        keyboardAvoiding as StingKeyboardAvoidingLayout

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
        keyboardAvoiding.applyKeyboardInsetForTesting(bottom = 40)

        val styledPadding = (8f * context.resources.displayMetrics.density).toInt()
        assertEquals(styledPadding, keyboardAvoiding.paddingLeft)
        assertEquals(styledPadding, keyboardAvoiding.paddingTop)
        assertEquals(styledPadding, keyboardAvoiding.paddingRight)
        assertEquals(styledPadding + 40, keyboardAvoiding.paddingBottom)
    }
}
