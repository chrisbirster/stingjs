package run.stingjs.modules.audio

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import run.stingjs.runtime.StingApplicationLifecycleEvent
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingNativeObject
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

class AudioModule(private val context: Context) : StingNativeModule {
    override val name = "Audio"
    override val version = "0.1.0"
    private var emitter: StingNativeModuleEventEmitter? = null
    private val players = CopyOnWriteArrayList<AudioPlayerObject>()

    override fun callSync(method: String, arguments: List<Any?>): Any? = throw StingNativeModuleError("E_METHOD_NOT_FOUND", "Audio does not implement module method $method")
    override fun createObject(type: String, arguments: List<Any?>): StingNativeObject {
        if (type != "Player") throw StingNativeModuleError("E_OBJECT_TYPE_NOT_FOUND", "Audio does not implement object $type")
        return AudioPlayerObject(context) { emitter?.invoke(it) }.also(players::add)
    }
    override fun setEventEnabled(event: String, enabled: Boolean, emit: StingNativeModuleEventEmitter) {
        if (event != "stateChange") throw StingNativeModuleError("E_EVENT_NOT_FOUND", "Audio does not implement event $event")
        emitter = if (enabled) emit else null
    }
    override fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {
        if (event == StingApplicationLifecycleEvent.BACKGROUND || event == StingApplicationLifecycleEvent.RUNTIME_DISPOSING) players.forEach { it.pauseForLifecycle() }
        if (event == StingApplicationLifecycleEvent.RUNTIME_DISPOSING) { players.forEach { it.dispose() }; players.clear() }
    }
}

private class AudioPlayerObject(private val context: Context, private val emit: (Map<String, Any?>) -> Unit) : StingNativeObject {
    private val id = UUID.randomUUID().toString()
    private var player: MediaPlayer? = null
    private var state = "idle"
    private var pendingLoad: StingNativeModuleCompletion? = null

    override fun callSync(method: String, arguments: List<Any?>): Any? = when (method) {
        "getId" -> id
        "getStatus" -> status()
        else -> throw StingNativeModuleError("E_OBJECT_METHOD_NOT_FOUND", "AudioPlayer does not implement synchronous method $method")
    }

    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        when (method) {
            "load" -> {
                val raw = arguments.firstOrNull() as? String ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_INVALID_ARGUMENT", "AudioPlayer.load requires a URI."))); return }
                disposePlayerOnly(); state = "loading"; emitState(); pendingLoad = completion
                try {
                    val media = MediaPlayer()
                    player = media
                    media.setDataSource(context, Uri.parse(raw))
                    media.setOnPreparedListener { state = "ready"; emitState(); pendingLoad?.invoke(StingNativeModuleResult.Success(null)); pendingLoad = null }
                    media.setOnCompletionListener { state = "ended"; emitState() }
                    media.setOnErrorListener { _, what, extra -> state = "error"; emitState(); pendingLoad?.invoke(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO_LOAD", "MediaPlayer error $what/$extra"))); pendingLoad = null; true }
                    media.prepareAsync()
                } catch (error: Throwable) { state = "error"; emitState(); pendingLoad = null; completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO_LOAD", error.message ?: "Unable to load audio."))) }
            }
            "play" -> performReady(completion) { it.start(); state = "playing" }
            "pause" -> performReady(completion) { if (it.isPlaying) it.pause(); state = "paused" }
            "seek" -> performReady(completion) { it.seekTo((((arguments.firstOrNull() as? Number)?.toDouble() ?: 0.0) * 1000).toInt().coerceAtLeast(0)) }
            "stop" -> performReady(completion) { if (it.isPlaying) it.pause(); it.seekTo(0); state = "ready" }
            else -> completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_OBJECT_METHOD_NOT_FOUND", "AudioPlayer does not implement asynchronous method $method")))
        }
    }

    fun pauseForLifecycle() { if (state == "playing") { runCatching { player?.pause() }; state = "paused"; emitState() } }
    override fun dispose() { pendingLoad?.invoke(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO_DISPOSED", "Audio player was disposed."))); pendingLoad = null; disposePlayerOnly(); state = "idle" }
    private fun disposePlayerOnly() { runCatching { player?.reset() }; runCatching { player?.release() }; player = null }
    private fun performReady(completion: StingNativeModuleCompletion, action: (MediaPlayer) -> Unit) {
        val media = player ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO_NOT_LOADED", "Load audio before using the player."))); return }
        if (state == "loading" || state == "error" || state == "idle") { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO_NOT_READY", "Audio player is not ready."))); return }
        try { action(media); emitState(); completion(StingNativeModuleResult.Success(null)) } catch (error: Throwable) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_AUDIO", error.message ?: "Audio operation failed."))) }
    }
    private fun status(): Map<String, Any?> { val media = player; val duration = runCatching { media?.duration?.takeIf { it >= 0 }?.div(1000.0) }.getOrNull(); val position = runCatching { media?.currentPosition?.div(1000.0) ?: 0.0 }.getOrDefault(0.0); return mapOf("id" to id, "state" to state, "duration" to duration, "position" to position) }
    private fun emitState() { emit(status()) }
}
