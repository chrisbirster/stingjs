import AVFoundation
import Foundation
import StingRuntime

public final class AudioModule: StingNativeModule {
    public let name = "Audio"
    public let version = "0.1.0"
    private var eventEmitter: StingNativeModuleEventEmitter?
    private var players: [WeakAudioPlayer] = []

    public init() {}
    public func callSync(method: String, arguments: [Any]) throws -> Any? { throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Audio does not implement module method \(method)") }
    public func createObject(type: String, arguments: [Any]) throws -> any StingNativeObject {
        guard type == "Player" else { throw StingNativeModuleError(code: "E_OBJECT_TYPE_NOT_FOUND", message: "Audio does not implement object \(type)") }
        let player = AudioPlayerObject { [weak self] payload in self?.eventEmitter?(payload) }
        players.removeAll { $0.value == nil }
        players.append(WeakAudioPlayer(player))
        return player
    }
    public func setEventEnabled(event: String, enabled: Bool, emit: @escaping StingNativeModuleEventEmitter) throws {
        guard event == "stateChange" else { throw StingNativeModuleError(code: "E_EVENT_NOT_FOUND", message: "Audio does not implement event \(event)") }
        eventEmitter = enabled ? emit : nil
    }
    public func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
        if event == .background || event == .runtimeDisposing { players.compactMap(\.value).forEach { $0.pauseForLifecycle() } }
        if event == .runtimeDisposing { players.compactMap(\.value).forEach { $0.dispose() }; players.removeAll() }
    }
}

private final class WeakAudioPlayer { weak var value: AudioPlayerObject?; init(_ value: AudioPlayerObject) { self.value = value } }

private final class AudioPlayerObject: NSObject, StingNativeObject {
    private let id = UUID().uuidString
    private let player = AVPlayer()
    private let emit: ([String: Any]) -> Void
    private var state = "idle"
    private var endObserver: NSObjectProtocol?

    init(emit: @escaping ([String: Any]) -> Void) { self.emit = emit; super.init() }

    func callSync(method: String, arguments: [Any]) throws -> Any? {
        switch method {
        case "getId": return id
        case "getStatus": return status()
        default: throw StingNativeModuleError(code: "E_OBJECT_METHOD_NOT_FOUND", message: "AudioPlayer does not implement synchronous method \(method)")
        }
    }

    func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        switch method {
        case "load":
            guard let raw = arguments.first as? String, let url = URL(string: raw) else { completion(.failure(StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: "AudioPlayer.load requires a URI."))); return }
            state = "loading"; emitState()
            if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
            let item = AVPlayerItem(url: url)
            player.replaceCurrentItem(with: item)
            endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in self?.state = "ended"; self?.emitState() }
            state = "ready"; emitState(); completion(.success(nil))
        case "play": player.play(); state = "playing"; emitState(); completion(.success(nil))
        case "pause": player.pause(); state = "paused"; emitState(); completion(.success(nil))
        case "seek":
            let value = (arguments.first as? NSNumber)?.doubleValue ?? 0
            player.seek(to: CMTime(seconds: max(0, value), preferredTimescale: 600)) { _ in completion(.success(nil)) }
        case "stop": player.pause(); player.seek(to: .zero); state = "ready"; emitState(); completion(.success(nil))
        default: completion(.failure(StingNativeModuleError(code: "E_OBJECT_METHOD_NOT_FOUND", message: "AudioPlayer does not implement asynchronous method \(method)")))
        }
    }

    func pauseForLifecycle() { if state == "playing" { player.pause(); state = "paused"; emitState() } }
    func dispose() { player.pause(); player.replaceCurrentItem(with: nil); if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }; endObserver = nil; state = "idle" }

    private func status() -> [String: Any] {
        let duration = player.currentItem?.duration.seconds ?? .nan
        let position = player.currentTime().seconds
        return ["id": id, "state": state, "duration": duration.isFinite ? duration : NSNull(), "position": position.isFinite ? position : 0]
    }
    private func emitState() { emit(status()) }
}
