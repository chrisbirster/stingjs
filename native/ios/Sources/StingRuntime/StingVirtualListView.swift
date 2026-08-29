import UIKit

/// Vertical fixed-extent native windowing container.
///
/// Solid owns item identity. Native keeps child instances indexed but only mounts
/// the visible window plus overscan into the UIScrollView hierarchy.
final class StingVirtualListView: UIScrollView {
    private var items: [UIView] = []
    private var itemExtent: CGFloat = 44
    private var overscan = 2
    private var testOffset: CGFloat?
    private var testViewportHeight: CGFloat?

    func setItemExtent(_ value: CGFloat) throws {
        guard value > 0 else { throw StingRuntimeError("VirtualList itemExtent must be greater than zero") }
        itemExtent = value
        refreshWindow()
    }

    func setOverscan(_ value: Int) {
        overscan = max(0, value)
        refreshWindow()
    }

    func insertItem(_ view: UIView, at index: Int) {
        view.removeFromSuperview()
        items.insert(view, at: min(max(index, 0), items.count))
        refreshWindow()
    }

    func removeItem(_ view: UIView) {
        items.removeAll { $0 === view }
        view.removeFromSuperview()
        refreshWindow()
    }

    func clearItems() {
        items.forEach { $0.removeFromSuperview() }
        items.removeAll(keepingCapacity: false)
        refreshWindow()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        refreshWindow()
    }

    func updateViewportForTesting(offset: CGFloat, height: CGFloat) {
        testOffset = max(0, offset)
        testViewportHeight = max(0, height)
        refreshWindow()
    }

    var activeIndicesForTesting: [Int] {
        items.enumerated().compactMap { index, view in
            view.superview === self ? index : nil
        }
    }

    private func refreshWindow() {
        contentSize = CGSize(width: bounds.width, height: itemExtent * CGFloat(items.count))
        guard !items.isEmpty else { return }

        let viewportHeight = testViewportHeight ?? bounds.height
        let offset = testOffset ?? contentOffset.y
        let firstVisible = min(
            items.count - 1,
            max(0, Int(floor(offset / itemExtent)))
        )
        let visibleCount = max(1, Int(ceil(max(viewportHeight, itemExtent) / itemExtent)))
        let start = max(0, firstVisible - overscan)
        let end = min(items.count - 1, firstVisible + visibleCount + overscan - 1)

        for (index, child) in items.enumerated() {
            if index >= start && index <= end {
                if child.superview !== self { addSubview(child) }
                child.frame = CGRect(
                    x: 0,
                    y: CGFloat(index) * itemExtent,
                    width: bounds.width,
                    height: itemExtent
                )
            } else if child.superview === self {
                child.removeFromSuperview()
            }
        }
    }
}
