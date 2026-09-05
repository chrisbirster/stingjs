package run.stingjs.runtime.candidates.quickjs

import android.os.Handler
import android.os.Looper
import run.stingjs.runtime.StingApplicationLifecycleEvent
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingRuntimeException

/**
 * Android wrapper for the pinned official QuickJS v0.1 production runtime.
 *
 * The implementation still lives under the historical prototype directory
 * while the portable runtime is consolidated. This class is not a public
 * engine-selection API.
 */
class OfficialQuickJsCandidateRuntime(
    private val bridge: StingNativeBridge,
) : AutoCloseable {
    private val ownerLooper = Looper.myLooper()
        ?: throw StingRuntimeException("Official QuickJS must be created on a thread with an Android Looper")
    private val ownerHandler = Handler(ownerLooper)

    private var handle: Long = nativeCreate(bridge).also {
        if (it == 0L) {
            throw StingRuntimeException("Unable to create the official QuickJS Android runtime")
        }
    }

    init {
        bridge.asyncResultSink = ::deliverModuleCompletion
        bridge.moduleEventSink = ::deliverModuleEvent
    }

    fun evaluate(source: String) {
        requireOwnerThread("evaluate JavaScript")
        val error = nativeEvaluate(handle, source)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS evaluation failed: $error")
        }
    }

    fun dispatchEvent(nodeId: Int, event: String, payloadJSON: String) {
        requireOwnerThread("dispatch a native event")
        val error = nativeDispatchEvent(handle, nodeId, event, payloadJSON)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS event dispatch failed: $error")
        }
    }

    fun requestBack(): Boolean {
        requireOwnerThread("handle a native back request")
        if (handle == 0L) return false
        return bridge.requestBack()
    }

    override fun close() {
        requireOwnerThread("destroy the runtime")
        val current = handle
        if (current == 0L) return

        handle = 0L

        // Give modules a portable terminal lifecycle callback while all of
        // their module views/objects are still owned and available for cleanup.
        bridge.dispatchLifecycle(StingApplicationLifecycleEvent.RUNTIME_DISPOSING)
        bridge.detachAsyncResultSink()
        bridge.detachModuleEventSink()
        try {
            // nativeDestroy runs the JavaScript runtime disposer first so Solid
            // can perform ordinary removeNode operations while the node registry
            // is still live.
            nativeDestroy(current)
        } finally {
            // Final native ownership cleanup happens only after JS/Solid teardown.
            // Module views are renderer nodes, while native objects use their
            // separate opaque-handle registry; both fallbacks are idempotent.
            bridge.disposeNativeViews()
            bridge.disposeNativeObjects()
        }
    }

    private fun deliverModuleCompletion(requestId: Int, responseJSON: String) {
        if (Looper.myLooper() === ownerLooper) {
            completeModuleCallOnOwnerThread(requestId, responseJSON)
            return
        }

        ownerHandler.post {
            completeModuleCallOnOwnerThread(requestId, responseJSON)
        }
    }

    private fun completeModuleCallOnOwnerThread(requestId: Int, responseJSON: String) {
        val current = handle
        if (current == 0L) return

        val error = nativeCompleteModuleCall(current, requestId, responseJSON)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS async module completion failed: $error")
        }
    }

    private fun deliverModuleEvent(module: String, event: String, payloadJSON: String) {
        // Always queue module events, even when a native module emits while
        // setModuleEventEnabled(true) is still on the owner thread. This avoids
        // recursive QuickJS entry and guarantees listener setup finishes first.
        ownerHandler.post {
            dispatchModuleEventOnOwnerThread(module, event, payloadJSON)
        }
    }

    private fun dispatchModuleEventOnOwnerThread(module: String, event: String, payloadJSON: String) {
        val current = handle
        if (current == 0L || !bridge.isModuleEventActive(module, event)) return

        val error = nativeDispatchModuleEvent(current, module, event, payloadJSON)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS module event dispatch failed: $error")
        }
    }

    private fun requireOwnerThread(operation: String) {
        if (Looper.myLooper() !== ownerLooper) {
            throw StingRuntimeException(
                "Official QuickJS must $operation on the Looper thread that created the runtime",
            )
        }
    }

    private external fun nativeCreate(bridge: StingNativeBridge): Long
    private external fun nativeEvaluate(handle: Long, source: String): String?
    private external fun nativeDispatchEvent(
        handle: Long,
        nodeId: Int,
        event: String,
        payloadJSON: String,
    ): String?
    private external fun nativeCompleteModuleCall(
        handle: Long,
        requestId: Int,
        responseJSON: String,
    ): String?
    private external fun nativeDispatchModuleEvent(
        handle: Long,
        module: String,
        event: String,
        payloadJSON: String,
    ): String?
    private external fun nativeDestroy(handle: Long)

    private companion object {
        init {
            System.loadLibrary("sting_quickjs_android")
        }
    }
}
