import Foundation
import StingRuntime

public final class BackgroundTaskModule: StingNativeModule {
    public let name = "BackgroundTask"
    public let version = "0.1.0"
    private let defaults: UserDefaults
    private let key = "run.stingjs.background-task.registrations"
    private var emitter: StingNativeModuleEventEmitter?

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "BackgroundTask does not implement synchronous method \(method)")
    }

    public func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        switch method {
        case "register":
            guard let task = arguments.first as? String, !task.isEmpty else { completion(.failure(StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: "Background task name is required."))); return }
            var values = registered(); values.insert(task); save(values); completion(.success(nil))
        case "unregister":
            guard let task = arguments.first as? String else { completion(.failure(StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: "Background task name is required."))); return }
            var values = registered(); values.remove(task); save(values); completion(.success(nil))
        case "getRegistered": completion(.success(Array(registered()).sorted()))
        default: completion(.failure(StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "BackgroundTask does not implement asynchronous method \(method)")))
        }
    }

    public func setEventEnabled(event: String, enabled: Bool, emit: @escaping StingNativeModuleEventEmitter) throws {
        guard event == "run" else { throw StingNativeModuleError(code: "E_EVENT_NOT_FOUND", message: "BackgroundTask does not implement event \(event)") }
        emitter = enabled ? emit : nil
    }

    public func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
        if event == .runtimeDisposing { emitter = nil }
    }

    public func handleBackgroundEvent(name taskName: String, payload: Any?, completion: @escaping StingNativeModuleCompletion) {
        guard registered().contains(taskName) else { completion(.failure(StingNativeModuleError(code: "E_BACKGROUND_TASK_NOT_REGISTERED", message: "Background task \(taskName) is not registered."))); return }
        emitter?(["name": taskName, "payload": payload ?? NSNull()])
        completion(.success(["accepted": true]))
    }

    private func registered() -> Set<String> { Set(defaults.stringArray(forKey: key) ?? []) }
    private func save(_ values: Set<String>) { defaults.set(Array(values).sorted(), forKey: key) }
}
