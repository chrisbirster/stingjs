package run.stingjs.runtime

import android.os.Build
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StingStylingInstrumentedTest {
    @Test
    fun resolvedStyleAppliesAndResetsNativeState() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)

        nodes.createElement(1, "view")
        nodes.insertNode(0, 1, -1)
        nodes.setProperty(
            1,
            "style",
            """
            {
              "__stingResolved": true,
              "flexDirection": "row",
              "alignItems": "center",
              "justifyContent": "center",
              "gap": 12,
              "paddingTop": 16,
              "paddingRight": 8,
              "paddingBottom": 16,
              "paddingLeft": 8,
              "backgroundColor": "#112233",
              "borderRadius": 10,
              "opacity": 0.75
            }
            """.trimIndent(),
        )

        val stack = nodes.viewForNode(1) as LinearLayout
        assertEquals(LinearLayout.HORIZONTAL, stack.orientation)
        assertEquals(0.75f, stack.alpha)
        assertNotNull(stack.background)
        assertEquals(16, (stack.paddingTop / context.resources.displayMetrics.density).toInt())
        assertEquals(8, (stack.paddingLeft / context.resources.displayMetrics.density).toInt())

        nodes.setProperty(
            1,
            "style",
            """
            {
              "__stingResolved": true,
              "flexDirection": null,
              "alignItems": null,
              "justifyContent": null,
              "gap": null,
              "paddingTop": null,
              "paddingRight": null,
              "paddingBottom": null,
              "paddingLeft": null,
              "backgroundColor": null,
              "borderRadius": null,
              "opacity": null
            }
            """.trimIndent(),
        )

        assertEquals(LinearLayout.VERTICAL, stack.orientation)
        assertEquals(1f, stack.alpha)
        assertEquals(0, stack.paddingTop)
        assertEquals(0, stack.paddingLeft)
    }

    @Test
    fun nativeBlurDescriptorIsAccepted() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val root = FrameLayout(context)
        val nodes = StingNodeRegistry(root)
        nodes.createElement(1, "view")
        nodes.insertNode(0, 1, -1)

        nodes.setProperty(
            1,
            "nativeModifiers",
            "[{\"name\":\"blur\",\"value\":{\"radius\":16}}]",
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            assertNotNull(nodes.viewForNode(1)?.renderEffect)
        }

        nodes.setProperty(1, "nativeModifiers", "[]")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            assertEquals(null, nodes.viewForNode(1)?.renderEffect)
        }
    }
}
