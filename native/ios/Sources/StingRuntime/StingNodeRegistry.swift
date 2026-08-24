import Foundation
import UIKit

final class StingNode {
    let id: Int
    let type: String
    let view: UIView?
    var textValue: String?
    var parentId: Int?
    var children: [Int] = []
    var widthConstraint: NSLayoutConstraint?
    var heightConstraint: NSLayoutConstraint?

    init(id: Int, type: String, view: UIView? = nil, textValue: String? = nil) {
        self.id = id
        self.type = type
        self.view = view
        self.textValue = textValue
    }
}

final class StingNodeRegistry {
    private var nodes: [Int: StingNode] = [:]
    var eventSink: ((Int, String, String) -> Void)?

    init(rootView: UIView) {
        nodes[0] = StingNode(id: 0, type: "root", view: rootView)
    }

    func createElement(id: Int, type: String) throws {
        guard nodes[id] == nil else { throw StingRuntimeError("Duplicate native node id \(id)") }

        let normalized = type.lowercased()
        let view: UIView

        switch normalized {
        case "view":
            let stack = UIStackView()
            stack.axis = .vertical
            stack.alignment = .fill
            stack.distribution = .fill
            stack.spacing = 0
            stack.translatesAutoresizingMaskIntoConstraints = false
            view = stack
        case "text":
            let label = UILabel()
            label.numberOfLines = 0
            view = label
        case "button":
            let button = StingButton(type: .system)
            button.nodeId = id
            button.onPress = { [weak self] nodeId in
                self?.eventSink?(nodeId, "press", "null")
            }
            view = button
        default:
            throw StingRuntimeError("Unsupported native element type: \(type)")
        }

        nodes[id] = StingNode(id: id, type: normalized, view: view)
    }

    func createTextNode(id: Int, value: String) throws {
        guard nodes[id] == nil else { throw StingRuntimeError("Duplicate native node id \(id)") }
        nodes[id] = StingNode(id: id, type: "#text", textValue: value)
    }

    func replaceText(id: Int, value: String) throws {
        let node = try requireNode(id)
        guard node.type == "#text" else { throw StingRuntimeError("Node \(id) is not a text node") }
        node.textValue = value
        if let parentId = node.parentId {
            refreshTextContent(parentId)
        }
    }

    func insertNode(parentId: Int, nodeId: Int, anchorId: Int) throws {
        let parent = try requireNode(parentId)
        let node = try requireNode(nodeId)

        if let previousParentId = node.parentId, let previousParent = nodes[previousParentId] {
            previousParent.children.removeAll { $0 == nodeId }
            detachView(node.view, from: previousParent.view)
            refreshTextContent(previousParentId)
        }

        let insertionIndex: Int
        if anchorId >= 0, let anchorIndex = parent.children.firstIndex(of: anchorId) {
            insertionIndex = anchorIndex
        } else {
            insertionIndex = parent.children.count
        }

        parent.children.insert(nodeId, at: insertionIndex)
        node.parentId = parentId

        try attachView(node, to: parent, at: insertionIndex)
        refreshTextContent(parentId)
    }

    func removeNode(parentId: Int, nodeId: Int) throws {
        let parent = try requireNode(parentId)
        let node = try requireNode(nodeId)
        guard node.parentId == parentId else {
            throw StingRuntimeError("Node \(nodeId) is not a child of \(parentId)")
        }

        parent.children.removeAll { $0 == nodeId }
        node.parentId = nil
        detachView(node.view, from: parent.view)
        refreshTextContent(parentId)
    }

    func setProperty(id: Int, name: String, valueJSON: String) throws {
        let node = try requireNode(id)
        let data = Data(valueJSON.utf8)
        let value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])

        switch name {
        case "style":
            guard let style = value as? [String: Any] else {
                throw StingRuntimeError("style must be a JSON object")
            }
            applyStyle(style, to: node)
        case "disabled":
            if let button = node.view as? UIButton, let disabled = value as? Bool {
                button.isEnabled = !disabled
            }
        case "accessibilityLabel":
            node.view?.accessibilityLabel = value as? String
        default:
            // The JS renderer warns/validates public properties. Keeping unknown
            // properties harmless here lets the native surface grow incrementally.
            break
        }
    }

    func setEventEnabled(id: Int, event: String, enabled: Bool) throws {
        let node = try requireNode(id)
        guard event == "press", let button = node.view as? StingButton else {
            throw StingRuntimeError("Event \(event) is not supported by node \(id)")
        }
        button.setPressEnabled(enabled)
    }

    private func requireNode(_ id: Int) throws -> StingNode {
        guard let node = nodes[id] else { throw StingRuntimeError("Unknown native node id \(id)") }
        return node
    }

    private func attachView(_ node: StingNode, to parent: StingNode, at index: Int) throws {
        guard let childView = node.view else { return }
        guard let parentView = parent.view else {
            throw StingRuntimeError("Cannot insert a native view below a text-only node")
        }

        if parent.type == "text" || parent.type == "button" {
            throw StingRuntimeError("Text and Button may only contain textual children in v0.1")
        }

        if let stack = parentView as? UIStackView {
            stack.insertArrangedSubview(childView, at: min(index, stack.arrangedSubviews.count))
        } else {
            parentView.addSubview(childView)
        }
    }

    private func detachView(_ childView: UIView?, from parentView: UIView?) {
        guard let childView else { return }
        if let stack = parentView as? UIStackView {
            stack.removeArrangedSubview(childView)
        }
        childView.removeFromSuperview()
    }

    private func refreshTextContent(_ parentId: Int) {
        guard let parent = nodes[parentId] else { return }
        let text = parent.children.compactMap { nodes[$0]?.textValue }.joined()

        if let label = parent.view as? UILabel {
            label.text = text
        } else if let button = parent.view as? UIButton {
            button.setTitle(text, for: .normal)
        }
    }

    private func applyStyle(_ style: [String: Any], to node: StingNode) {
        guard let view = node.view else { return }

        if let backgroundColor = style["backgroundColor"] as? String {
            view.backgroundColor = UIColor(stingHex: backgroundColor)
        }

        if let stack = view as? UIStackView {
            if let direction = style["flexDirection"] as? String {
                stack.axis = direction == "row" ? .horizontal : .vertical
            }
            if let gap = style["gap"] as? NSNumber {
                stack.spacing = CGFloat(truncating: gap)
            }
            if let padding = style["padding"] as? NSNumber {
                let amount = CGFloat(truncating: padding)
                stack.isLayoutMarginsRelativeArrangement = true
                stack.directionalLayoutMargins = NSDirectionalEdgeInsets(
                    top: amount,
                    leading: amount,
                    bottom: amount,
                    trailing: amount
                )
            }
        }

        if let color = style["color"] as? String, let parsed = UIColor(stingHex: color) {
            if let label = view as? UILabel { label.textColor = parsed }
            if let button = view as? UIButton { button.setTitleColor(parsed, for: .normal) }
        }

        if let fontSize = style["fontSize"] as? NSNumber {
            let size = CGFloat(truncating: fontSize)
            if let label = view as? UILabel { label.font = label.font.withSize(size) }
            if let button = view as? UIButton { button.titleLabel?.font = button.titleLabel?.font.withSize(size) }
        }

        if let width = style["width"] as? NSNumber {
            node.widthConstraint?.isActive = false
            node.widthConstraint = view.widthAnchor.constraint(equalToConstant: CGFloat(truncating: width))
            node.widthConstraint?.isActive = true
        }

        if let height = style["height"] as? NSNumber {
            node.heightConstraint?.isActive = false
            node.heightConstraint = view.heightAnchor.constraint(equalToConstant: CGFloat(truncating: height))
            node.heightConstraint?.isActive = true
        }
    }
}

private extension UIColor {
    convenience init?(stingHex value: String) {
        var hex = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let integer = Int(hex, radix: 16) else { return nil }

        self.init(
            red: CGFloat((integer >> 16) & 0xff) / 255,
            green: CGFloat((integer >> 8) & 0xff) / 255,
            blue: CGFloat(integer & 0xff) / 255,
            alpha: 1
        )
    }
}
