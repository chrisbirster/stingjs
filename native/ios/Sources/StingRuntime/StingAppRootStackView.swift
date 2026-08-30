import UIKit

/// Full-bleed application root with native attach and app-state signals.
/// SafeArea and keyboard handling remain explicit child concerns.
final class StingAppRootStackView: UIStackView {
    private typealias Handler = ([String: Any]) -> Void
    private var handlers: [String: Handler] = [:]
    private var observing = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        configure()
    }

    required init(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        axis = .vertical
        alignment = .fill
        distribution = .fill
        spacing = 0
    }

    func setLifecycleEventEnabled(
        event: String,
        enabled: Bool,
        handler: @escaping ([String: Any]) -> Void
    ) throws {
        guard Self.supportedEvents.contains(event) else {
            throw StingRuntimeError("Unsupported app root event: \(event)")
        }
        if enabled { handlers[event] = handler } else { handlers.removeValue(forKey: event) }
        if enabled, event == "appStateChange", window != nil {
            emitCurrentState()
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            startObserving()
            emit("appear", payload: [:])
            emitCurrentState()
        } else {
            emit("disappear", payload: [:])
            stopObserving()
        }
    }

    func disposeLifecycle() {
        stopObserving()
        handlers.removeAll(keepingCapacity: false)
    }

    func emitStateForTesting(_ state: String) {
        emit("appStateChange", payload: ["state": state])
    }

    func emitAppearForTesting(_ appeared: Bool) {
        emit(appeared ? "appear" : "disappear", payload: [:])
    }

    @objc private func didBecomeActive() { emit("appStateChange", payload: ["state": "active"]) }
    @objc private func willResignActive() { emit("appStateChange", payload: ["state": "inactive"]) }
    @objc private func didEnterBackground() { emit("appStateChange", payload: ["state": "background"]) }
    @objc private func willEnterForeground() { emit("appStateChange", payload: ["state": "inactive"]) }

    private func startObserving() {
        guard !observing else { return }
        observing = true
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(willResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    private func stopObserving() {
        guard observing else { return }
        observing = false
        NotificationCenter.default.removeObserver(self)
    }

    private func emitCurrentState() {
        let state: String
        switch UIApplication.shared.applicationState {
        case .active: state = "active"
        case .background: state = "background"
        default: state = "inactive"
        }
        emit("appStateChange", payload: ["state": state])
    }

    private func emit(_ event: String, payload: [String: Any]) {
        handlers[event]?(payload)
    }

    private static let supportedEvents: Set<String> = ["appear", "disappear", "appStateChange"]
}
