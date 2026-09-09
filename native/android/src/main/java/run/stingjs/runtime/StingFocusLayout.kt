package run.stingjs.runtime

import android.content.Context
import android.widget.LinearLayout

/** Explicit focusable container with plain focus/blur events. */
internal class StingFocusLayout(context: Context) : LinearLayout(context) {
    private var autoFocus = false
    private val handlers = mutableMapOf<String, () -> Unit>()

    init {
        orientation = VERTICAL
        isFocusable = true
        isFocusableInTouchMode = true
        onFocusChangeListener = OnFocusChangeListener { _, hasFocus ->
            handlers[if (hasFocus) "focus" else "blur"]?.invoke()
        }
    }

    fun setFocusEventEnabled(event: String, enabled: Boolean, handler: () -> Unit) {
        require(event == "focus" || event == "blur") { "Unsupported focus event: $event" }
        if (enabled) handlers[event] = handler else handlers.remove(event)
    }

    fun setAutoFocus(enabled: Boolean) {
        autoFocus = enabled
        if (enabled && isAttachedToWindow) requestFocus()
    }

    fun clearFocusHandlers() {
        handlers.clear()
        autoFocus = false
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (autoFocus) requestFocus()
    }

    internal fun emitFocusForTesting(focused: Boolean) {
        handlers[if (focused) "focus" else "blur"]?.invoke()
    }
}
