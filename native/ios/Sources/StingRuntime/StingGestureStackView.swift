import UIKit

/// Native gesture surface backed by UIKit recognizers and plain-value event payloads.
final class StingGestureStackView: UIStackView {
    private typealias Handler = ([String: Any]) -> Void
    private var handlers: [String: Handler] = [:]

    private lazy var tapRecognizer = makeRecognizer(
        UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    )
    private lazy var longPressRecognizer = makeRecognizer(
        UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
    )
    private lazy var panRecognizer = makeRecognizer(
        UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
    )

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
        isUserInteractionEnabled = true
    }

    private func makeRecognizer<T: UIGestureRecognizer>(_ recognizer: T) -> T {
        // GestureView observes native gestures without cancelling touches that
        // belong to nested buttons, inputs, or other native controls.
        recognizer.cancelsTouchesInView = false
        return recognizer
    }

    func setGestureEventEnabled(
        event: String,
        enabled: Bool,
        handler: @escaping ([String: Any]) -> Void
    ) throws {
        guard Self.supportedEvents.contains(event) else {
            throw StingRuntimeError("Unsupported gesture event: \(event)")
        }
        if enabled {
            handlers[event] = handler
        } else {
            handlers.removeValue(forKey: event)
        }
        refreshRecognizers()
    }

    func clearGestureHandlers() {
        handlers.removeAll(keepingCapacity: false)
        refreshRecognizers()
    }

    private func refreshRecognizers() {
        setRecognizer(tapRecognizer, attached: handlers["tap"] != nil)
        setRecognizer(longPressRecognizer, attached: handlers["longPress"] != nil)
        let panEnabled = handlers["panStart"] != nil || handlers["pan"] != nil || handlers["panEnd"] != nil
        setRecognizer(panRecognizer, attached: panEnabled)
    }

    private func setRecognizer(_ recognizer: UIGestureRecognizer, attached: Bool) {
        if attached, recognizer.view !== self {
            addGestureRecognizer(recognizer)
        } else if !attached, recognizer.view === self {
            removeGestureRecognizer(recognizer)
        }
    }

    @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .ended else { return }
        handlers["tap"]?(pointPayload(recognizer))
    }

    @objc private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began else { return }
        handlers["longPress"]?(pointPayload(recognizer))
    }

    @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
        let translation = recognizer.translation(in: self)
        let velocity = recognizer.velocity(in: self)
        let location = recognizer.location(in: self)
        let cancelled = recognizer.state == .cancelled || recognizer.state == .failed
        let payload: [String: Any] = [
            "x": location.x,
            "y": location.y,
            "translationX": translation.x,
            "translationY": translation.y,
            "velocityX": velocity.x,
            "velocityY": velocity.y,
            "touches": recognizer.numberOfTouches,
            "cancelled": cancelled,
        ]

        switch recognizer.state {
        case .began:
            handlers["panStart"]?(payload)
        case .changed:
            handlers["pan"]?(payload)
        case .ended, .cancelled, .failed:
            handlers["panEnd"]?(payload)
        default:
            break
        }
    }

    private func pointPayload(_ recognizer: UIGestureRecognizer) -> [String: Any] {
        let location = recognizer.location(in: self)
        return [
            "x": location.x,
            "y": location.y,
            "touches": recognizer.numberOfTouches,
        ]
    }

    func emitForTesting(event: String, payload: [String: Any]) {
        handlers[event]?(payload)
    }

    private static let supportedEvents: Set<String> = [
        "tap",
        "longPress",
        "panStart",
        "pan",
        "panEnd",
    ]
}
