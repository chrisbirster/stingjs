import UIKit

final class StingScrollView: UIScrollView {
    let contentStack = UIStackView()
    private var crossAxisConstraint: NSLayoutConstraint?

    override init(frame: CGRect) {
        super.init(frame: frame)
        translatesAutoresizingMaskIntoConstraints = false
        contentStack.axis = .vertical
        contentStack.alignment = .fill
        contentStack.distribution = .fill
        contentStack.spacing = 0
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(contentStack)

        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(equalTo: contentLayoutGuide.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: contentLayoutGuide.trailingAnchor),
            contentStack.topAnchor.constraint(equalTo: contentLayoutGuide.topAnchor),
            contentStack.bottomAnchor.constraint(equalTo: contentLayoutGuide.bottomAnchor),
        ])
        setHorizontal(false)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("StingScrollView is programmatic-only")
    }

    func setHorizontal(_ horizontal: Bool) {
        crossAxisConstraint?.isActive = false
        contentStack.axis = horizontal ? .horizontal : .vertical
        alwaysBounceHorizontal = horizontal
        alwaysBounceVertical = !horizontal
        crossAxisConstraint = horizontal
            ? contentStack.heightAnchor.constraint(equalTo: frameLayoutGuide.heightAnchor)
            : contentStack.widthAnchor.constraint(equalTo: frameLayoutGuide.widthAnchor)
        crossAxisConstraint?.isActive = true
    }
}
