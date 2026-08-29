package run.stingjs.runtime

import android.content.Context
import android.os.Build
import android.view.WindowInsets
import android.widget.LinearLayout
import kotlin.math.max

/**
 * LinearLayout whose authored padding is additive with the current IME overlap.
 *
 * System bars/cutouts remain the responsibility of SafeArea. This container adds
 * only the keyboard/IME portion so both primitives can be composed without
 * double-counting navigation-bar insets.
 */
internal class StingKeyboardAvoidingLayout(context: Context) : LinearLayout(context) {
    private val contentPadding = IntArray(4)
    private var keyboardInsetBottom = 0

    init {
        orientation = VERTICAL
        setOnApplyWindowInsetsListener { _, insets ->
            setKeyboardInsetBottom(resolveKeyboardInsetBottom(insets))
            insets
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        requestApplyInsets()
    }

    fun setContentPadding(left: Int, top: Int, right: Int, bottom: Int) {
        contentPadding[0] = left
        contentPadding[1] = top
        contentPadding[2] = right
        contentPadding[3] = bottom
        applyResolvedPadding()
    }

    internal fun applyKeyboardInsetForTesting(bottom: Int) {
        setKeyboardInsetBottom(bottom)
    }

    private fun setKeyboardInsetBottom(bottom: Int) {
        keyboardInsetBottom = max(0, bottom)
        applyResolvedPadding()
    }

    private fun applyResolvedPadding() {
        super.setPadding(
            contentPadding[0],
            contentPadding[1],
            contentPadding[2],
            contentPadding[3] + keyboardInsetBottom,
        )
    }

    private fun resolveKeyboardInsetBottom(insets: WindowInsets): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return insets.getInsets(WindowInsets.Type.ime()).bottom
        }

        @Suppress("DEPRECATION")
        val systemBottom = insets.systemWindowInsetBottom
        @Suppress("DEPRECATION")
        val stableBottom = insets.stableInsetBottom
        return max(0, systemBottom - stableBottom)
    }
}
