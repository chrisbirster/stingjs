import UIKit

/// Explicit first-responder container with plain focus/blur events.
final class StingFocusStackView: UIStackView {
    private var autoFocus = false
    private var handlers: [String: () -> Void] = [:]

    override var canBecomeFirstResponder: Bool { true }

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

    func setFocusEventEnabled(event: String, enabled: Bool, handler: @escaping () -> Void) throws {
        guard event == "focus" || event == "blur" else {
            throw StingRuntimeError("Unsupported focus event: \(event)")
        }
        if enabled { handlers[event] = handler } else { handlers.removeValue(forKey: event) }
    }

    func setAutoFocus(_ enabled: Bool) {
        autoFocus = enabled
        if enabled, window != nil { _ = becomeFirstResponder() }
    }

    func clearFocusHandlers() {
        handlers.removeAll(keepingCapacity: false)
        autoFocus = false
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if autoFocus, window != nil { _ = becomeFirstResponder() }
    }

    @discardableResult
    override func becomeFirstResponder() -> Bool {
        let changed = super.becomeFirstResponder()
        if changed { handlers["focus"]?() }
        return changed
    }

    @discardableResult
    override func resignFirstResponder() -> Bool {
        let wasFocused = isFirstResponder
        let changed = super.resignFirstResponder()
        if changed && wasFocused { handlers["blur"]?() }
        return changed
    }

    func emitFocusForTesting(_ focused: Bool) {
        handlers[focused ? "focus" : "blur"]?()
    }
}
