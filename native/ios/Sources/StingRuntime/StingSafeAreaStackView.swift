import UIKit

/**
 * UIStackView whose authored content margins are additive with UIKit safe-area insets.
 *
 * The renderer continues to style an ordinary stack. Safe-area changes are resolved natively,
 * so rotation/notch changes do not require rebuilding the Solid component tree.
 */
final class StingSafeAreaStackView: UIStackView {
    private var contentMargins = NSDirectionalEdgeInsets.zero
    private var currentSafeAreaInsets = UIEdgeInsets.zero

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
        // Sting adds the safe-area values itself so authored padding remains additive.
        insetsLayoutMarginsFromSafeArea = false
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        currentSafeAreaInsets = safeAreaInsets
        refreshResolvedMargins()
    }

    func setContentMargins(_ margins: NSDirectionalEdgeInsets) {
        contentMargins = margins
        refreshResolvedMargins()
    }

    func applySafeAreaInsetsForTesting(_ insets: UIEdgeInsets) {
        currentSafeAreaInsets = insets
        refreshResolvedMargins()
    }

    private func refreshResolvedMargins() {
        directionalLayoutMargins = NSDirectionalEdgeInsets(
            top: contentMargins.top + currentSafeAreaInsets.top,
            leading: contentMargins.leading + currentSafeAreaInsets.left,
            bottom: contentMargins.bottom + currentSafeAreaInsets.bottom,
            trailing: contentMargins.trailing + currentSafeAreaInsets.right
        )
        isLayoutMarginsRelativeArrangement = true
    }
}
