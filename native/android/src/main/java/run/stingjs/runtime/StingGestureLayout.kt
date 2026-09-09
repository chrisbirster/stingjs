package run.stingjs.runtime

import android.content.Context
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.widget.LinearLayout
import kotlin.math.hypot

/** Native gesture surface that observes touches without owning application state. */
internal class StingGestureLayout(context: Context) : LinearLayout(context) {
    private val handlers = mutableMapOf<String, (Map<String, Any>) -> Unit>()
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
    private var downX = 0f
    private var downY = 0f
    private var panActive = false
    private var velocityTracker: VelocityTracker? = null

    private val gestureDetector = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
                emit("tap", pointPayload(event))
                return handlers.containsKey("tap")
            }

            override fun onLongPress(event: MotionEvent) {
                emit("longPress", pointPayload(event))
            }
        },
    )

    init {
        orientation = VERTICAL
        // Keep the surface eligible for the full touch stream when no child
        // consumes it. dispatchTouchEvent still delegates to children normally.
        isClickable = true
    }

    fun setGestureEventEnabled(
        event: String,
        enabled: Boolean,
        handler: (Map<String, Any>) -> Unit,
    ) {
        require(event in SUPPORTED_EVENTS) { "Unsupported gesture event: $event" }
        if (enabled) handlers[event] = handler else handlers.remove(event)
    }

    fun clearGestureHandlers() {
        handlers.clear()
        velocityTracker?.recycle()
        velocityTracker = null
        panActive = false
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        gestureDetector.onTouchEvent(event)
        trackPan(event)
        return super.dispatchTouchEvent(event)
    }

    private fun trackPan(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                panActive = false
                velocityTracker?.recycle()
                velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
            }

            MotionEvent.ACTION_MOVE -> {
                velocityTracker?.addMovement(event)
                val translationX = event.x - downX
                val translationY = event.y - downY
                if (!panActive && hypot(translationX, translationY) >= touchSlop && hasPanHandler()) {
                    panActive = true
                    emit("panStart", panPayload(event, translationX, translationY, cancelled = false))
                }
                if (panActive) {
                    emit("pan", panPayload(event, translationX, translationY, cancelled = false))
                }
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                velocityTracker?.addMovement(event)
                if (panActive) {
                    emit(
                        "panEnd",
                        panPayload(
                            event,
                            event.x - downX,
                            event.y - downY,
                            cancelled = event.actionMasked == MotionEvent.ACTION_CANCEL,
                        ),
                    )
                }
                velocityTracker?.recycle()
                velocityTracker = null
                panActive = false
            }
        }
    }

    private fun hasPanHandler(): Boolean =
        handlers.containsKey("panStart") || handlers.containsKey("pan") || handlers.containsKey("panEnd")

    private fun pointPayload(event: MotionEvent): Map<String, Any> = mapOf(
        "x" to event.x.toDouble(),
        "y" to event.y.toDouble(),
        "touches" to event.pointerCount,
    )

    private fun panPayload(
        event: MotionEvent,
        translationX: Float,
        translationY: Float,
        cancelled: Boolean,
    ): Map<String, Any> {
        velocityTracker?.computeCurrentVelocity(1000)
        return mapOf(
            "x" to event.x.toDouble(),
            "y" to event.y.toDouble(),
            "translationX" to translationX.toDouble(),
            "translationY" to translationY.toDouble(),
            "velocityX" to (velocityTracker?.xVelocity ?: 0f).toDouble(),
            "velocityY" to (velocityTracker?.yVelocity ?: 0f).toDouble(),
            "touches" to event.pointerCount,
            "cancelled" to cancelled,
        )
    }

    private fun emit(event: String, payload: Map<String, Any>) {
        handlers[event]?.invoke(payload)
    }

    internal fun emitForTesting(event: String, payload: Map<String, Any>) {
        emit(event, payload)
    }

    private companion object {
        val SUPPORTED_EVENTS = setOf("tap", "longPress", "panStart", "pan", "panEnd")
    }
}
