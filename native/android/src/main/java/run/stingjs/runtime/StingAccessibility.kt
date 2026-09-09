package run.stingjs.runtime

import android.os.Build
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import java.util.WeakHashMap

internal object StingAccessibility {
    private data class Metadata(
        var role: String? = null,
        var hint: String? = null,
        var value: String? = null,
    )

    private val metadata = WeakHashMap<View, Metadata>()

    fun setRole(view: View, role: String?) {
        entry(view).role = role
        refreshDelegate(view)
    }

    fun setHint(view: View, hint: String?) {
        entry(view).hint = hint
        refreshDelegate(view)
    }

    fun setValue(view: View, value: String?) {
        entry(view).value = value
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) view.stateDescription = value
        refreshDelegate(view)
    }

    fun setHidden(view: View, hidden: Boolean) {
        view.importantForAccessibility = if (hidden) {
            View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        } else {
            View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        }
    }

    fun clear(view: View) {
        metadata.remove(view)
        view.accessibilityDelegate = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) view.stateDescription = null
        view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
    }

    private fun entry(view: View): Metadata = metadata.getOrPut(view) { Metadata() }

    private fun refreshDelegate(view: View) {
        val values = metadata[view] ?: return
        view.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = when (values.role) {
                    "button" -> Button::class.java.name
                    "image" -> ImageView::class.java.name
                    "header", "text", "link" -> TextView::class.java.name
                    else -> host.javaClass.name
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    info.isHeading = values.role == "header"
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    info.hintText = values.hint
                }
                val stateValue = values.value
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && !stateValue.isNullOrBlank()) {
                    val label = host.contentDescription?.toString().orEmpty()
                    info.contentDescription = listOf(label, stateValue)
                        .filter { it.isNotBlank() }
                        .joinToString(", ")
                }
            }
        }
    }
}
