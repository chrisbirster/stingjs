import UIKit

/**
 * UIStackView whose authored content margins are additive with the keyboard overlap.
 *
 * The keyboard is handled entirely in UIKit. Solid components do not subscribe to a
 * global keyboard event stream or rebuild when the keyboard frame changes.
 */
final class StingKeyboardAvoidingStackView: UIStackView {
    private var contentMargins = NSDirectionalEdgeInsets.zero
    private var currentKeyboardInset: CGFloat = 0

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
        translatesAutoresizingMaskIntoConstraints = false
        isLayoutMarginsRelativeArrangement = true
        insetsLayoutMarginsFromSafeArea = false
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let keyboardFrame = keyboardLayoutGuide.layoutFrame
        let overlap = max(0, bounds.intersection(keyboardFrame).height)
        if abs(overlap - currentKeyboardInset) > 0.5 {
            currentKeyboardInset = overlap
            refreshResolvedMargins()
        }
    }

    func setContentMargins(_ margins: NSDirectionalEdgeInsets) {
        contentMargins = margins
        refreshResolvedMargins()
    }

    func applyKeyboardInsetForTesting(_ bottom: CGFloat) {
        currentKeyboardInset = max(0, bottom)
        refreshResolvedMargins()
    }

    private func refreshResolvedMargins() {
        directionalLayoutMargins = NSDirectionalEdgeInsets(
            top: contentMargins.top,
            leading: contentMargins.leading,
            bottom: contentMargins.bottom + currentKeyboardInset,
            trailing: contentMargins.trailing
        )
        isLayoutMarginsRelativeArrangement = true
    }
}
