package run.stingjs.runtime

import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.FrameLayout
import android.widget.LinearLayout

/**
 * Invisible renderer node that owns content presented through an Android Dialog.
 * The content container survives dismiss/re-present cycles so Solid/native identity
 * remains stable while presentation is controlled declaratively.
 */
internal class StingPresentationHostView(
    context: Context,
    val kind: String,
) : FrameLayout(context) {
    val content = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
    }

    private var requestedPresented = false
    private var dialog: Dialog? = null
    private var dismissHandler: (() -> Unit)? = null
    private var suppressDismissEvent = false

    init {
        require(kind == "modal" || kind == "sheet") { "Unsupported presentation kind: $kind" }
        layoutParams = ViewGroup.LayoutParams(0, 0)
    }

    fun setPresented(presented: Boolean) {
        requestedPresented = presented
        if (presented) showIfPossible() else dismiss(programmatic = true)
    }

    fun setDismissHandler(enabled: Boolean, handler: () -> Unit) {
        dismissHandler = if (enabled) handler else null
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (requestedPresented) showIfPossible()
    }

    override fun onDetachedFromWindow() {
        dismiss(programmatic = true)
        super.onDetachedFromWindow()
    }

    fun disposePresentation() {
        requestedPresented = false
        dismiss(programmatic = true)
        dismissHandler = null
    }

    internal fun isPresentedForTesting(): Boolean = requestedPresented

    internal fun simulateDismissForTesting() {
        if (!requestedPresented) return
        requestedPresented = false
        dismissHandler?.invoke()
    }

    private fun showIfPossible() {
        if (!isAttachedToWindow || dialog?.isShowing == true) return
        val activity = context.findActivity() ?: return
        if (content.parent != null) {
            (content.parent as? ViewGroup)?.removeView(content)
        }

        val next = Dialog(activity).apply {
            requestWindowFeature(Window.FEATURE_NO_TITLE)
            setContentView(content)
            setOnDismissListener {
                val shouldEmit = !suppressDismissEvent && requestedPresented
                requestedPresented = false
                dialog = null
                if (shouldEmit) dismissHandler?.invoke()
            }
            window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            window?.setLayout(
                ViewGroup.LayoutParams.MATCH_PARENT,
                if (kind == "sheet") ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT,
            )
            if (kind == "sheet") {
                window?.setGravity(Gravity.BOTTOM)
            }
        }
        dialog = next
        next.show()
        next.window?.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            if (kind == "sheet") ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT,
        )
        if (kind == "sheet") next.window?.setGravity(Gravity.BOTTOM)
    }

    private fun dismiss(programmatic: Boolean) {
        val current = dialog ?: return
        suppressDismissEvent = programmatic
        try {
            current.dismiss()
        } finally {
            suppressDismissEvent = false
            dialog = null
        }
    }
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}
