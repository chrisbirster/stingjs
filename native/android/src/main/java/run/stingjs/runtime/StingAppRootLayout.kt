package run.stingjs.runtime

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import android.widget.LinearLayout

/**
 * Full-bleed application root with native attach and foreground/background signals.
 * SafeArea and keyboard handling remain explicit child concerns.
 */
internal class StingAppRootLayout(context: Context) : LinearLayout(context), Application.ActivityLifecycleCallbacks {
    private val handlers = mutableMapOf<String, (Map<String, Any>) -> Unit>()
    private var registered = false
    private val activity: Activity? = context.findActivityForStingRoot()

    init {
        orientation = VERTICAL
    }

    fun setLifecycleEventEnabled(
        event: String,
        enabled: Boolean,
        handler: (Map<String, Any>) -> Unit,
    ) {
        require(event in SUPPORTED_EVENTS) { "Unsupported app root event: $event" }
        if (enabled) handlers[event] = handler else handlers.remove(event)
        if (enabled && event == "appStateChange" && isAttachedToWindow) {
            emitState(if (activity?.hasWindowFocus() == true) "active" else "inactive")
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        registerLifecycle()
        emit("appear", emptyMap())
        emitState(if (activity?.hasWindowFocus() == true) "active" else "inactive")
    }

    override fun onDetachedFromWindow() {
        emit("disappear", emptyMap())
        unregisterLifecycle()
        super.onDetachedFromWindow()
    }

    fun disposeLifecycle() {
        unregisterLifecycle()
        handlers.clear()
    }

    override fun onActivityResumed(activity: Activity) {
        if (activity === this.activity) emitState("active")
    }

    override fun onActivityPaused(activity: Activity) {
        if (activity === this.activity) emitState("inactive")
    }

    override fun onActivityStopped(activity: Activity) {
        if (activity === this.activity) emitState("background")
    }

    override fun onActivityStarted(activity: Activity) {
        if (activity === this.activity) emitState("inactive")
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit

    internal fun emitStateForTesting(state: String) {
        emitState(state)
    }

    internal fun emitAppearForTesting(appeared: Boolean) {
        emit(if (appeared) "appear" else "disappear", emptyMap())
    }

    private fun registerLifecycle() {
        if (registered) return
        val application = activity?.application ?: return
        application.registerActivityLifecycleCallbacks(this)
        registered = true
    }

    private fun unregisterLifecycle() {
        if (!registered) return
        activity?.application?.unregisterActivityLifecycleCallbacks(this)
        registered = false
    }

    private fun emitState(state: String) {
        emit("appStateChange", mapOf("state" to state))
    }

    private fun emit(event: String, payload: Map<String, Any>) {
        handlers[event]?.invoke(payload)
    }

    private companion object {
        val SUPPORTED_EVENTS = setOf("appear", "disappear", "appStateChange")
    }
}

private fun Context.findActivityForStingRoot(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}
