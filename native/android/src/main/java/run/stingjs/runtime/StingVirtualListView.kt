package run.stingjs.runtime

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ScrollView
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Vertical fixed-extent native windowing container.
 *
 * Solid still owns child identity. The list keeps those native child instances in
 * an indexed cache but only attaches the visible window plus overscan to the view
 * hierarchy, avoiding layout/draw work for the full collection.
 */
internal class StingVirtualListView(context: Context) : ScrollView(context) {
    private val content = FrameLayout(context)
    private val items = mutableListOf<View>()
    private var itemExtentDp = 44f
    private var overscan = 2
    private var testOffsetPx: Int? = null
    private var testViewportHeightPx: Int? = null

    init {
        isFillViewport = false
        addView(content, LayoutParams(LayoutParams.MATCH_PARENT, 0))
    }

    fun setItemExtentDp(value: Float) {
        require(value > 0f) { "VirtualList itemExtent must be greater than zero" }
        itemExtentDp = value
        refreshWindow()
    }

    fun setOverscan(value: Int) {
        overscan = value.coerceAtLeast(0)
        refreshWindow()
    }

    fun insertItem(view: View, index: Int) {
        (view.parent as? ViewGroup)?.removeView(view)
        items.add(index.coerceIn(0, items.size), view)
        refreshWindow()
    }

    fun removeItem(view: View) {
        items.remove(view)
        if (view.parent === content) content.removeView(view)
        refreshWindow()
    }

    fun clearItems() {
        items.toList().forEach { if (it.parent === content) content.removeView(it) }
        items.clear()
        refreshWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        refreshWindow()
    }

    override fun onScrollChanged(l: Int, t: Int, oldl: Int, oldt: Int) {
        super.onScrollChanged(l, t, oldl, oldt)
        refreshWindow()
    }

    internal fun updateViewportForTesting(offsetPx: Int, heightPx: Int) {
        testOffsetPx = offsetPx.coerceAtLeast(0)
        testViewportHeightPx = heightPx.coerceAtLeast(0)
        refreshWindow()
    }

    internal fun activeIndicesForTesting(): List<Int> = items.mapIndexedNotNull { index, view ->
        index.takeIf { view.parent === content }
    }

    private fun refreshWindow() {
        val extent = dp(itemExtentDp).coerceAtLeast(1)
        val totalHeight = extent * items.size
        val params = content.layoutParams ?: LayoutParams(LayoutParams.MATCH_PARENT, totalHeight)
        params.width = LayoutParams.MATCH_PARENT
        params.height = totalHeight
        content.layoutParams = params

        if (items.isEmpty()) return
        val viewportHeight = testViewportHeightPx ?: height
        val offset = testOffsetPx ?: scrollY
        val firstVisible = floor(offset.toDouble() / extent).toInt().coerceIn(0, items.lastIndex)
        val visibleCount = ceil(viewportHeight.coerceAtLeast(extent).toDouble() / extent).toInt().coerceAtLeast(1)
        val start = (firstVisible - overscan).coerceAtLeast(0)
        val end = (firstVisible + visibleCount + overscan - 1).coerceAtMost(items.lastIndex)

        items.forEachIndexed { index, child ->
            if (index in start..end) {
                if (child.parent !== content) content.addView(child)
                val existing = child.layoutParams
                val childParams = if (existing is FrameLayout.LayoutParams) existing else FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    extent,
                )
                childParams.width = ViewGroup.LayoutParams.MATCH_PARENT
                childParams.height = extent
                childParams.topMargin = index * extent
                child.layoutParams = childParams
            } else if (child.parent === content) {
                content.removeView(child)
            }
        }
    }

    private fun dp(value: Float): Int = (value * resources.displayMetrics.density).toInt()
}
