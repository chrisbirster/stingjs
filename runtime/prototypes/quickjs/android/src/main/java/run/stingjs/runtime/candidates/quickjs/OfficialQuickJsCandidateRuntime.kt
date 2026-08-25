package run.stingjs.runtime.candidates.quickjs

import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingRuntimeException

/**
 * Android bring-up wrapper for the pinned official QuickJS candidate.
 *
 * This is deliberately candidate-specific. It is not a public Sting engine
 * abstraction and must not be interpreted as an engine selection.
 */
class OfficialQuickJsCandidateRuntime(
    bridge: StingNativeBridge,
) : AutoCloseable {
    private var handle: Long = nativeCreate(bridge).also {
        if (it == 0L) {
            throw StingRuntimeException("Unable to create the official QuickJS Android candidate runtime")
        }
    }

    fun evaluate(source: String) {
        val error = nativeEvaluate(handle, source)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS evaluation failed: $error")
        }
    }

    fun dispatchEvent(nodeId: Int, event: String, payloadJSON: String) {
        val error = nativeDispatchEvent(handle, nodeId, event, payloadJSON)
        if (error != null) {
            throw StingRuntimeException("Official QuickJS event dispatch failed: $error")
        }
    }

    override fun close() {
        val current = handle
        if (current == 0L) return
        handle = 0L
        nativeDestroy(current)
    }

    private external fun nativeCreate(bridge: StingNativeBridge): Long
    private external fun nativeEvaluate(handle: Long, source: String): String?
    private external fun nativeDispatchEvent(
        handle: Long,
        nodeId: Int,
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
