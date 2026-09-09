package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * Native navigation container whose children are the declarative Solid stack.
 * The last child is the active screen; previous screens remain mounted but hidden.
 * Back requests only emit an event. Solid remains authoritative for removing the
 * top screen so native and JavaScript route state can never diverge.
 */
internal class StingNavigationStackLayout(context: Context) : FrameLayout(context) {
    private var onBack: (() -> Unit)? = null

    override fun onViewAdded(child: View) {
        super.onViewAdded(child)
        val existing = child.layoutParams
        child.layoutParams = LayoutParams(
            existing?.width ?: ViewGroup.LayoutParams.MATCH_PARENT,
            existing?.height ?: ViewGroup.LayoutParams.MATCH_PARENT,
        )
        refreshVisibleScreen()
    }

    override fun onViewRemoved(child: View) {
        super.onViewRemoved(child)
        refreshVisibleScreen()
    }

    fun setBackHandler(enabled: Boolean, handler: () -> Unit) {
        onBack = if (enabled) handler else null
    }

    fun refreshVisibleScreen() {
        for (index in 0 until childCount) {
            getChildAt(index).visibility = if (index == childCount - 1) View.VISIBLE else View.GONE
        }
    }

    fun canHandleBack(): Boolean = childCount > 1 && onBack != null

    fun requestBack(): Boolean {
        if (!canHandleBack()) return false
        onBack?.invoke()
        return true
    }
}
