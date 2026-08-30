import UIKit

/// Invisible renderer node that owns content presented by UIKit.
///
/// The content stack survives dismiss/re-present cycles, preserving Solid/native
/// identity while the `presented` prop remains application-authoritative.
final class StingPresentationHostView: UIView, UIAdaptivePresentationControllerDelegate {
    let kind: String
    let contentStack = UIStackView()

    private var requestedPresented = false
    private weak var presentedController: UIViewController?
    private var dismissHandler: (() -> Void)?
    private var suppressDismissEvent = false

    init(frame: CGRect = .zero, kind: String) {
        precondition(kind == "modal" || kind == "sheet", "Unsupported presentation kind: \(kind)")
        self.kind = kind
        super.init(frame: frame)
        configure()
    }

    required init?(coder: NSCoder) {
        self.kind = "modal"
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        contentStack.axis = .vertical
        contentStack.alignment = .fill
        contentStack.distribution = .fill
        contentStack.spacing = 0
        isHidden = true
    }

    func setPresented(_ presented: Bool) {
        requestedPresented = presented
        if presented {
            presentIfPossible()
        } else {
            dismiss(programmatic: true)
        }
    }

    func setDismissHandler(enabled: Bool, handler: @escaping () -> Void) {
        dismissHandler = enabled ? handler : nil
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil, requestedPresented {
            presentIfPossible()
        } else if window == nil {
            dismiss(programmatic: true)
        }
    }

    func disposePresentation() {
        requestedPresented = false
        dismiss(programmatic: true)
        dismissHandler = nil
    }

    var isRequestedPresentedForTesting: Bool { requestedPresented }

    func simulateDismissForTesting() {
        guard requestedPresented else { return }
        requestedPresented = false
        dismissHandler?()
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !suppressDismissEvent else { return }
        requestedPresented = false
        presentedController = nil
        dismissHandler?()
    }

    private func presentIfPossible() {
        guard requestedPresented,
              presentedController == nil,
              let presenter = nearestViewController(),
              presenter.presentedViewController == nil else { return }

        let controller = UIViewController()
        controller.view.backgroundColor = kind == "sheet" ? .systemBackground : .clear
        contentStack.removeFromSuperview()
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
            contentStack.topAnchor.constraint(equalTo: controller.view.topAnchor),
            contentStack.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor),
        ])

        controller.modalPresentationStyle = kind == "sheet" ? .pageSheet : .overFullScreen
        presentedController = controller
        presenter.present(controller, animated: false) { [weak controller, weak self] in
            controller?.presentationController?.delegate = self
        }
    }

    private func dismiss(programmatic: Bool) {
        guard let controller = presentedController else { return }
        suppressDismissEvent = programmatic
        controller.dismiss(animated: false) { [weak self] in
            guard let self else { return }
            self.contentStack.removeFromSuperview()
            self.presentedController = nil
            self.suppressDismissEvent = false
        }
    }

    private func nearestViewController() -> UIViewController? {
        var responder: UIResponder? = self
        while let current = responder {
            if let controller = current as? UIViewController { return controller }
            responder = current.next
        }
        return window?.rootViewController
    }
}
