package run.stingjs.runtime

import android.content.Context
import android.os.Build
import android.view.WindowInsets
import android.widget.LinearLayout

/**
 * LinearLayout whose content padding is additive with the current system safe-area insets.
 *
 * Sting styles own content padding. System bars/cutouts are applied underneath that contract
 * so inset changes do not require rebuilding the Solid component tree.
 */
internal class StingSafeAreaLayout(context: Context) : LinearLayout(context) {
    private val contentPadding = IntArray(4)
    private val safeAreaInsets = IntArray(4)

    init {
        orientation = VERTICAL
        setOnApplyWindowInsetsListener { _, insets ->
            val resolved = resolveSafeAreaInsets(insets)
            setSafeAreaInsets(resolved[0], resolved[1], resolved[2], resolved[3])
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

    internal fun applySafeAreaInsetsForTesting(left: Int, top: Int, right: Int, bottom: Int) {
        setSafeAreaInsets(left, top, right, bottom)
    }

    private fun setSafeAreaInsets(left: Int, top: Int, right: Int, bottom: Int) {
        safeAreaInsets[0] = left
        safeAreaInsets[1] = top
        safeAreaInsets[2] = right
        safeAreaInsets[3] = bottom
        applyResolvedPadding()
    }

    private fun applyResolvedPadding() {
        super.setPadding(
            contentPadding[0] + safeAreaInsets[0],
            contentPadding[1] + safeAreaInsets[1],
            contentPadding[2] + safeAreaInsets[2],
            contentPadding[3] + safeAreaInsets[3],
        )
    }

    private fun resolveSafeAreaInsets(insets: WindowInsets): IntArray {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val safe = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            return intArrayOf(safe.left, safe.top, safe.right, safe.bottom)
        }

        @Suppress("DEPRECATION")
        return intArrayOf(
            insets.systemWindowInsetLeft,
            insets.systemWindowInsetTop,
            insets.systemWindowInsetRight,
            insets.systemWindowInsetBottom,
        )
    }
}
