import UIKit

/// Native navigation container whose subviews are the declarative Solid stack.
///
/// Only the last child is visible. A native back request emits into the existing
/// Sting node-event channel; Solid remains authoritative for actually removing
/// the top screen so native and JavaScript route state cannot diverge.
final class StingNavigationStackView: UIView {
    private var backHandler: (() -> Void)?

    override func didAddSubview(_ subview: UIView) {
        super.didAddSubview(subview)
        subview.frame = bounds
        subview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        refreshVisibleScreen()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        for child in subviews {
            child.frame = bounds
        }
    }

    func setBackHandler(enabled: Bool, handler: @escaping () -> Void) {
        backHandler = enabled ? handler : nil
    }

    func refreshVisibleScreen() {
        for (index, child) in subviews.enumerated() {
            child.isHidden = index != subviews.count - 1
        }
    }

    var canHandleBack: Bool {
        subviews.count > 1 && backHandler != nil
    }

    @discardableResult
    func requestBack() -> Bool {
        guard canHandleBack else { return false }
        backHandler?()
        return true
    }
}
