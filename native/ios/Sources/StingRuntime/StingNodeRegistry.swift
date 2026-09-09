import Foundation
import UIKit

final class StingNode {
    let id: Int
    let type: String
    let view: UIView?
    let nativeModuleView: (any StingNativeView)?
    var textValue: String?
    var parentId: Int?
    var children: [Int] = []
    var widthConstraint: NSLayoutConstraint?
    var heightConstraint: NSLayoutConstraint?
    var imageTask: URLSessionDataTask?
    var imageSource: String?
    var enabledModuleViewEvents: Set<String> = []
    var isAttached = false
    var blurView: UIVisualEffectView?
    var styledKeys: Set<String> = []
    let originalBackgroundColor: UIColor?
    let originalAlpha: CGFloat
    let originalCornerRadius: CGFloat
    let originalMasksToBounds: Bool
    let originalFont: UIFont?
    let originalTextColor: UIColor?
    let originalButtonTitleColor: UIColor?
    let originalButtonInsets: UIEdgeInsets?
    let originalStackAxis: NSLayoutConstraint.Axis?
    let originalStackAlignment: UIStackView.Alignment?
    let originalStackDistribution: UIStackView.Distribution?
    let originalStackSpacing: CGFloat?
    let originalStackMargins: NSDirectionalEdgeInsets?
    let originalStackUsesMargins: Bool?
    let originalAccessibilityTraits: UIAccessibilityTraits
    let originalIsAccessibilityElement: Bool
    let originalAccessibilityElementsHidden: Bool

    init(
        id: Int,
        type: String,
        view: UIView? = nil,
        textValue: String? = nil,
        nativeModuleView: (any StingNativeView)? = nil
    ) {
        self.id = id
        self.type = type
        self.view = view
        self.textValue = textValue
        self.nativeModuleView = nativeModuleView
        self.originalBackgroundColor = view?.backgroundColor
        self.originalAlpha = view?.alpha ?? 1
        self.originalCornerRadius = view?.layer.cornerRadius ?? 0
        self.originalMasksToBounds = view?.layer.masksToBounds ?? false
        self.originalAccessibilityTraits = view?.accessibilityTraits ?? []
        self.originalIsAccessibilityElement = view?.isAccessibilityElement ?? false
        self.originalAccessibilityElementsHidden = view?.accessibilityElementsHidden ?? false
        if let label = view as? UILabel {
            self.originalFont = label.font
            self.originalTextColor = label.textColor
        } else if let button = view as? UIButton {
            self.originalFont = button.titleLabel?.font
            self.originalTextColor = nil
        } else if let input = view as? UITextField {
            self.originalFont = input.font
            self.originalTextColor = input.textColor
        } else {
            self.originalFont = nil
            self.originalTextColor = nil
        }
        if let button = view as? UIButton {
            self.originalButtonTitleColor = button.titleColor(for: .normal)
            self.originalButtonInsets = button.contentEdgeInsets
        } else {
            self.originalButtonTitleColor = nil
            self.originalButtonInsets = nil
        }
        if let stack = view as? UIStackView {
            self.originalStackAxis = stack.axis
            self.originalStackAlignment = stack.alignment
            self.originalStackDistribution = stack.distribution
            self.originalStackSpacing = stack.spacing
            self.originalStackMargins = stack.directionalLayoutMargins
            self.originalStackUsesMargins = stack.isLayoutMarginsRelativeArrangement
        } else {
            self.originalStackAxis = nil
            self.originalStackAlignment = nil
            self.originalStackDistribution = nil
            self.originalStackSpacing = nil
            self.originalStackMargins = nil
            self.originalStackUsesMargins = nil
        }
    }
}

final class StingNodeRegistry {
    private var nodes: [Int: StingNode] = [:]
    private var disposed = false
    var eventSink: ((Int, String, String) -> Void)?
    var moduleViewFactory: ((String, String) throws -> any StingNativeView)?

    init(rootView: UIView) {
        let root = StingNode(id: 0, type: "root", view: rootView)
        root.isAttached = true
        nodes[0] = root
    }

    func createElement(id: Int, type: String) throws {
        guard !disposed else { throw StingRuntimeError("Cannot create nodes after the Sting node registry is disposed") }
        guard nodes[id] == nil else { throw StingRuntimeError("Duplicate native node id \(id)") }

        if let identity = try Self.parseModuleViewIdentity(type) {
            guard let moduleViewFactory else {
                throw StingNativeModuleError(
                    code: "E_NATIVE_VIEW_UNAVAILABLE",
                    message: "Native module views are not connected to this Sting host"
                )
            }
            let nativeView = try moduleViewFactory(identity.module, identity.viewType)
            nodes[id] = StingNode(
                id: id,
                type: type,
                view: nativeView.view,
                nativeModuleView: nativeView
            )
            return
        }

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
        case "safearea":
            view = StingSafeAreaStackView(frame: .zero)
        case "keyboardavoidingview":
            view = StingKeyboardAvoidingStackView(frame: .zero)
        case "navigationstack":
            view = StingNavigationStackView(frame: .zero)
        case "gestureview":
            view = StingGestureStackView(frame: .zero)
        case "modal", "sheet":
            view = StingPresentationHostView(kind: normalized)
        case "virtuallist":
            view = StingVirtualListView(frame: .zero)
        case "focusview":
            view = StingFocusStackView(frame: .zero)
        case "approot":
            view = StingAppRootStackView(frame: .zero)
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
        case "image":
            let imageView = UIImageView()
            imageView.contentMode = .scaleAspectFit
            imageView.clipsToBounds = true
            view = imageView
        case "textinput":
            let textInput = StingTextInput(frame: .zero)
            textInput.nodeId = id
            textInput.borderStyle = .roundedRect
            textInput.onChangeText = { [weak self] nodeId, value in
                self?.eventSink?(nodeId, "changeText", Self.encodeJSONFragment(value))
            }
            view = textInput
        case "scrollview":
            view = StingScrollView(frame: .zero)
        default:
            throw StingRuntimeError("Unsupported native element type: \(type)")
        }
        nodes[id] = StingNode(id: id, type: normalized, view: view)
    }

    func createTextNode(id: Int, value: String) throws {
        guard !disposed else { throw StingRuntimeError("Cannot create nodes after the Sting node registry is disposed") }
        guard nodes[id] == nil else { throw StingRuntimeError("Duplicate native node id \(id)") }
        nodes[id] = StingNode(id: id, type: "#text", textValue: value)
    }

    func replaceText(id: Int, value: String) throws {
        let node = try requireNode(id)
        guard node.type == "#text" else { throw StingRuntimeError("Node \(id) is not a text node") }
        node.textValue = value
        if let parentId = node.parentId { refreshTextContent(parentId) }
    }

    func insertNode(parentId: Int, nodeId: Int, anchorId: Int) throws {
        let parent = try requireNode(parentId)
        let node = try requireNode(nodeId)

        if let previousParentId = node.parentId, let previousParent = nodes[previousParentId] {
            previousParent.children.removeAll { $0 == nodeId }
            if node.isAttached { propagateDetach(nodeId) }
            node.parentId = nil
            detachView(node.view, from: childContainer(for: previousParent))
            refreshTextContent(previousParentId)
            refreshNavigation(previousParent)
        }

        let insertionIndex: Int
        if anchorId >= 0, let anchorIndex = parent.children.firstIndex(of: anchorId) {
            insertionIndex = anchorIndex
        } else {
            insertionIndex = parent.children.count
        }

        parent.children.insert(nodeId, at: insertionIndex)
        node.parentId = parentId
        do {
            try attachView(node, to: parent, at: insertionIndex)
        } catch {
            parent.children.removeAll { $0 == nodeId }
            node.parentId = nil
            throw error
        }
        if parent.isAttached { propagateAttach(nodeId) }
        refreshTextContent(parentId)
        refreshNavigation(parent)
    }

    func removeNode(parentId: Int, nodeId: Int) throws {
        let parent = try requireNode(parentId)
        let node = try requireNode(nodeId)
        guard node.parentId == parentId else {
            throw StingRuntimeError("Node \(nodeId) is not a child of \(parentId)")
        }
        parent.children.removeAll { $0 == nodeId }
        if node.isAttached { propagateDetach(nodeId) }
        node.parentId = nil
        detachView(node.view, from: childContainer(for: parent))
        refreshTextContent(parentId)
        refreshNavigation(parent)
    }

    func setProperty(id: Int, name: String, valueJSON: String) throws {
        let node = try requireNode(id)
        let data = Data(valueJSON.utf8)
        let value = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])

        if let nativeView = node.nativeModuleView {
            switch name {
            case "style":
                guard let style = value as? [String: Any] else {
                    throw StingRuntimeError("style must be a JSON object")
                }
                applyStyle(style, to: node)
            case "nativeModifiers":
                guard let modifiers = value as? [[String: Any]] else {
                    throw StingRuntimeError("nativeModifiers must be a JSON array")
                }
                applyNativeModifiers(modifiers, to: node)
            case let property where Self.accessibilityProperties.contains(property):
                applyAccessibilityProperty(value, name: property, to: node)
            default:
                try nativeView.setProperty(name: name, value: value)
            }
            return
        }

        switch name {
        case "style":
            guard let style = value as? [String: Any] else {
                throw StingRuntimeError("style must be a JSON object")
            }
            applyStyle(style, to: node)
        case "nativeModifiers":
            guard let modifiers = value as? [[String: Any]] else {
                throw StingRuntimeError("nativeModifiers must be a JSON array")
            }
            applyNativeModifiers(modifiers, to: node)
        case "disabled":
            if let button = node.view as? UIButton, let disabled = value as? Bool {
                button.isEnabled = !disabled
            }
        case let property where Self.accessibilityProperties.contains(property):
            applyAccessibilityProperty(value, name: property, to: node)
        case "source":
            applyImageSource(value, to: node)
        case "resizeMode":
            if let imageView = node.view as? UIImageView, let mode = value as? String {
                switch mode {
                case "cover": imageView.contentMode = .scaleAspectFill
                case "stretch": imageView.contentMode = .scaleToFill
                default: imageView.contentMode = .scaleAspectFit
                }
            }
        case "value":
            if let input = node.view as? UITextField {
                input.text = value is NSNull ? "" : (value as? String ?? "")
            }
        case "placeholder":
            if let input = node.view as? UITextField {
                input.placeholder = value is NSNull ? nil : value as? String
            }
        case "editable":
            if let input = node.view as? UITextField, let editable = value as? Bool {
                input.isEnabled = editable
            }
        case "horizontal":
            if let scroll = node.view as? StingScrollView, let horizontal = value as? Bool {
                scroll.setHorizontal(horizontal)
            }
        case "presented":
            (node.view as? StingPresentationHostView)?.setPresented(value as? Bool ?? false)
        case "itemExtent":
            if let number = value as? NSNumber, let list = node.view as? StingVirtualListView {
                try list.setItemExtent(CGFloat(truncating: number))
            }
        case "overscan":
            if let number = value as? NSNumber {
                (node.view as? StingVirtualListView)?.setOverscan(number.intValue)
            }
        case "autoFocus":
            let autoFocus = value as? Bool ?? false
            if let focus = node.view as? StingFocusStackView {
                focus.setAutoFocus(autoFocus)
            } else if autoFocus {
                _ = node.view?.becomeFirstResponder()
            }
        default:
            break
        }
    }

    func setEventEnabled(id: Int, event: String, enabled: Bool) throws {
        let node = try requireNode(id)

        if let nativeView = node.nativeModuleView {
            if enabled {
                node.enabledModuleViewEvents.insert(event)
                do {
                    try nativeView.setEventEnabled(event: event, enabled: true) { [weak self, weak node] payload in
                        guard let self,
                              !self.disposed,
                              let node,
                              self.nodes[id] === node,
                              node.isAttached,
                              node.enabledModuleViewEvents.contains(event) else { return }
                        self.eventSink?(id, event, Self.encodeJSONFragment(payload))
                    }
                } catch {
                    node.enabledModuleViewEvents.remove(event)
                    throw error
                }
            } else {
                node.enabledModuleViewEvents.remove(event)
                try nativeView.setEventEnabled(event: event, enabled: false, emit: { _ in })
            }
            return
        }

        switch (event, node.view) {
        case ("press", let button as StingButton):
            button.setPressEnabled(enabled)
        case ("changeText", let input as StingTextInput):
            input.setChangeTextEnabled(enabled)
        case ("back", let navigation as StingNavigationStackView):
            navigation.setBackHandler(enabled: enabled) { [weak self, weak node] in
                self?.emitNodeEventIfCurrent(node, event: "back", payload: nil)
            }
        case (let gestureEvent, let gesture as StingGestureStackView) where Self.gestureEvents.contains(gestureEvent):
            try gesture.setGestureEventEnabled(event: gestureEvent, enabled: enabled) { [weak self, weak node] payload in
                self?.emitNodeEventIfCurrent(node, event: gestureEvent, payload: payload)
            }
        case ("dismiss", let presentation as StingPresentationHostView):
            presentation.setDismissHandler(enabled: enabled) { [weak self, weak node] in
                self?.emitNodeEventIfCurrent(node, event: "dismiss", payload: nil)
            }
        case (let focusEvent, let focus as StingFocusStackView) where Self.focusEvents.contains(focusEvent):
            try focus.setFocusEventEnabled(event: focusEvent, enabled: enabled) { [weak self, weak node] in
                self?.emitNodeEventIfCurrent(node, event: focusEvent, payload: nil)
            }
        case (let rootEvent, let root as StingAppRootStackView) where Self.appRootEvents.contains(rootEvent):
            try root.setLifecycleEventEnabled(event: rootEvent, enabled: enabled) { [weak self, weak node] payload in
                self?.emitNodeEventIfCurrent(node, event: rootEvent, payload: payload)
            }
        default:
            throw StingRuntimeError("Event \(event) is not supported by node \(id)")
        }
    }

    /** Route a platform back request to the deepest active declarative navigation stack. */
    func requestBack() -> Bool {
        guard !disposed else { return false }
        let candidates = nodes.values
            .filter { node in
                node.isAttached &&
                    node.view is StingNavigationStackView &&
                    isOnActiveNavigationPath(node.id)
            }
            .sorted { navigationDepth($0.id) > navigationDepth($1.id) }

        for node in candidates {
            if let navigation = node.view as? StingNavigationStackView,
               navigation.requestBack() {
                return true
            }
        }
        return false
    }

    func dispose() {
        guard !disposed else { return }
        disposed = true
        eventSink = nil

        for node in nodes.values {
            switch node.view {
            case let navigation as StingNavigationStackView:
                navigation.setBackHandler(enabled: false, handler: {})
            case let gesture as StingGestureStackView:
                gesture.clearGestureHandlers()
            case let presentation as StingPresentationHostView:
                presentation.disposePresentation()
            case let list as StingVirtualListView:
                list.clearItems()
            case let focus as StingFocusStackView:
                focus.clearFocusHandlers()
            case let root as StingAppRootStackView:
                root.disposeLifecycle()
            default:
                break
            }
        }

        for id in nodes.keys.sorted() where id != 0 {
            guard let node = nodes[id], let nativeView = node.nativeModuleView else { continue }
            if node.isAttached {
                node.isAttached = false
                nativeView.didDetach()
            }
            let events = node.enabledModuleViewEvents
            node.enabledModuleViewEvents.removeAll(keepingCapacity: false)
            for event in events {
                try? nativeView.setEventEnabled(event: event, enabled: false, emit: { _ in })
            }
            detachView(node.view, from: node.view?.superview)
            nativeView.dispose()
        }
    }

    private func requireNode(_ id: Int) throws -> StingNode {
        guard !disposed else { throw StingRuntimeError("Sting node registry is disposed") }
        guard let node = nodes[id] else { throw StingRuntimeError("Unknown native node id \(id)") }
        return node
    }

    private func emitNodeEventIfCurrent(_ node: StingNode?, event: String, payload: Any?) {
        guard !disposed,
              let node,
              nodes[node.id] === node,
              node.isAttached else { return }
        eventSink?(node.id, event, Self.encodeJSONFragment(payload))
    }

    private func isOnActiveNavigationPath(_ nodeId: Int) -> Bool {
        var currentId = nodeId
        while true {
            guard let current = nodes[currentId] else { return false }
            guard let parentId = current.parentId else { return true }
            guard let parent = nodes[parentId] else { return false }
            if parent.view is StingNavigationStackView {
                let activeChild = parent.children.reversed().first { nodes[$0]?.view != nil }
                if activeChild != currentId { return false }
            }
            currentId = parentId
        }
    }

    private func navigationDepth(_ nodeId: Int) -> Int {
        var depth = 0
        var current = nodes[nodeId]
        while let parentId = current?.parentId {
            depth += 1
            current = nodes[parentId]
        }
        return depth
    }

    private func propagateAttach(_ nodeId: Int) {
        guard let node = nodes[nodeId], !node.isAttached else { return }
        node.isAttached = true
        for childId in node.children { propagateAttach(childId) }
        node.nativeModuleView?.didAttach()
    }

    private func propagateDetach(_ nodeId: Int) {
        guard let node = nodes[nodeId], node.isAttached else { return }
        node.isAttached = false
        for childId in node.children { propagateDetach(childId) }
        node.nativeModuleView?.didDetach()
    }

    private func attachView(_ node: StingNode, to parent: StingNode, at index: Int) throws {
        guard let childView = node.view else { return }
        if parent.nativeModuleView == nil && ["text", "button", "image", "textinput"].contains(parent.type) {
            throw StingRuntimeError("Native leaf node \(parent.type) cannot contain view children")
        }

        if let list = parent.view as? StingVirtualListView {
            list.insertItem(childView, at: index)
            return
        }

        guard let parentView = childContainer(for: parent) else {
            if parent.nativeModuleView != nil {
                throw StingRuntimeError("Native module view \(parent.type) does not accept view children")
            }
            throw StingRuntimeError("Cannot insert a native view below a text-only node")
        }
        if let scroll = parentView as? StingScrollView {
            scroll.contentStack.insertArrangedSubview(childView, at: min(index, scroll.contentStack.arrangedSubviews.count))
        } else if let stack = parentView as? UIStackView {
            stack.insertArrangedSubview(childView, at: min(index, stack.arrangedSubviews.count))
        } else {
            parentView.insertSubview(childView, at: min(index, parentView.subviews.count))
        }
    }

    private func childContainer(for node: StingNode) -> UIView? {
        if let nativeContainer = node.nativeModuleView?.childContainer { return nativeContainer }
        if let presentation = node.view as? StingPresentationHostView { return presentation.contentStack }
        return node.view
    }

    private func detachView(_ childView: UIView?, from parentView: UIView?) {
        guard let childView else { return }
        if let list = parentView as? StingVirtualListView {
            list.removeItem(childView)
            return
        }
        if let scroll = parentView as? StingScrollView {
            scroll.contentStack.removeArrangedSubview(childView)
        } else if let stack = parentView as? UIStackView {
            stack.removeArrangedSubview(childView)
        }
        childView.removeFromSuperview()
    }

    private func refreshTextContent(_ parentId: Int) {
        guard let parent = nodes[parentId], parent.nativeModuleView == nil else { return }
        let text = parent.children.compactMap { nodes[$0]?.textValue }.joined()
        if let label = parent.view as? UILabel {
            label.text = text
        } else if let button = parent.view as? UIButton {
            button.setTitle(text, for: .normal)
        }
    }

    private func refreshNavigation(_ parent: StingNode) {
        (parent.view as? StingNavigationStackView)?.refreshVisibleScreen()
    }

    private func applyAccessibilityProperty(_ value: Any, name: String, to node: StingNode) {
        guard let view = node.view else { return }
        switch name {
        case "accessibilityLabel":
            view.accessibilityLabel = value is NSNull ? nil : value as? String
        case "accessibilityHint":
            view.accessibilityHint = value is NSNull ? nil : value as? String
        case "accessibilityValue":
            view.accessibilityValue = value is NSNull ? nil : value as? String
        case "accessibilityRole":
            guard !(value is NSNull), let role = value as? String else {
                view.accessibilityTraits = node.originalAccessibilityTraits
                view.isAccessibilityElement = node.originalIsAccessibilityElement
                return
            }
            switch role {
            case "none":
                view.isAccessibilityElement = false
                view.accessibilityTraits = node.originalAccessibilityTraits
            case "header":
                view.isAccessibilityElement = true
                view.accessibilityTraits = [.header, .staticText]
            case "button":
                view.isAccessibilityElement = true
                view.accessibilityTraits = .button
            case "image":
                view.isAccessibilityElement = true
                view.accessibilityTraits = .image
            case "link":
                view.isAccessibilityElement = true
                view.accessibilityTraits = .link
            default:
                view.isAccessibilityElement = true
                view.accessibilityTraits = .staticText
            }
        case "accessibilityHidden":
            view.accessibilityElementsHidden = value as? Bool ?? node.originalAccessibilityElementsHidden
        case "focusable":
            let focusable = value as? Bool ?? false
            if focusable { view.isAccessibilityElement = true }
            else if view.accessibilityTraits == node.originalAccessibilityTraits {
                view.isAccessibilityElement = node.originalIsAccessibilityElement
            }
        default:
            break
        }
    }

    private func applyImageSource(_ value: Any, to node: StingNode) {
        guard let imageView = node.view as? UIImageView else { return }
        let uri: String?
        if let direct = value as? String {
            uri = direct
        } else if let object = value as? [String: Any] {
            uri = object["uri"] as? String
        } else {
            uri = nil
        }

        node.imageTask?.cancel()
        node.imageTask = nil
        node.imageSource = uri
        imageView.image = nil
        guard let uri, !uri.isEmpty else { return }

        if let url = URL(string: uri), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) {
            let task = URLSession.shared.dataTask(with: url) { [weak self, weak imageView] data, _, _ in
                guard let data, let image = UIImage(data: data) else { return }
                DispatchQueue.main.async {
                    guard self?.nodes[node.id]?.imageSource == uri else { return }
                    imageView?.image = image
                }
            }
            node.imageTask = task
            task.resume()
            return
        }

        if let url = URL(string: uri), url.isFileURL, let data = try? Data(contentsOf: url) {
            imageView.image = UIImage(data: data)
        } else {
            imageView.image = UIImage(named: uri)
        }
    }

    private func applyStyle(_ style: [String: Any], to node: StingNode) {
        guard let view = node.view else { return }
        let resolved = style["__stingResolved"] as? Bool == true

        if shouldApply(style, "backgroundColor", to: node, resolved: resolved) {
            view.backgroundColor = string(style, "backgroundColor").flatMap { UIColor(stingHex: $0) }
                ?? node.originalBackgroundColor
        }
        if shouldApply(style, "opacity", to: node, resolved: resolved) {
            view.alpha = number(style, "opacity") ?? node.originalAlpha
        }
        if shouldApply(style, "borderRadius", to: node, resolved: resolved) {
            if let radius = number(style, "borderRadius") {
                view.layer.cornerRadius = radius
                view.layer.masksToBounds = radius > 0
            } else {
                view.layer.cornerRadius = node.originalCornerRadius
                view.layer.masksToBounds = node.originalMasksToBounds
            }
        }

        if let stack = view as? UIStackView {
            if shouldApply(style, "flexDirection", to: node, resolved: resolved) {
                if let direction = string(style, "flexDirection") {
                    stack.axis = direction == "row" ? .horizontal : .vertical
                } else if let original = node.originalStackAxis {
                    stack.axis = original
                }
            }
            if shouldApply(style, "gap", to: node, resolved: resolved) {
                stack.spacing = number(style, "gap") ?? node.originalStackSpacing ?? 0
            }
            applyStackAlignment(style, to: stack, node: node, resolved: resolved)
            applyPadding(style, to: stack, node: node, resolved: resolved)
        } else if let scroll = view as? StingScrollView {
            applyPadding(style, to: scroll.contentStack, node: node, resolved: resolved)
        } else if let button = view as? UIButton {
            if shouldApplyPadding(style, to: node, resolved: resolved) {
                button.contentEdgeInsets = paddingEdges(style) ?? node.originalButtonInsets ?? .zero
            }
        }

        if shouldApply(style, "color", to: node, resolved: resolved) {
            let parsed = string(style, "color").flatMap { UIColor(stingHex: $0) }
            if let label = view as? UILabel { label.textColor = parsed ?? node.originalTextColor ?? .label }
            if let button = view as? UIButton {
                button.setTitleColor(parsed ?? node.originalButtonTitleColor ?? button.tintColor, for: .normal)
            }
            if let input = view as? UITextField { input.textColor = parsed ?? node.originalTextColor ?? .label }
        }

        let applyFontSize = shouldApply(style, "fontSize", to: node, resolved: resolved)
        let applyFontWeight = shouldApply(style, "fontWeight", to: node, resolved: resolved)
        if applyFontSize || applyFontWeight {
            let original = node.originalFont ?? UIFont.systemFont(ofSize: UIFont.labelFontSize)
            let size = number(style, "fontSize") ?? original.pointSize
            let hasWeight = string(style, "fontWeight") != nil || style["fontWeight"] is NSNumber
            let font: UIFont
            if hasWeight {
                let weight = Self.fontWeight(string(style, "fontWeight"), number: style["fontWeight"] as? NSNumber)
                font = UIFont.systemFont(ofSize: size, weight: weight)
            } else {
                font = original.withSize(size)
            }
            if let label = view as? UILabel { label.font = font }
            if let button = view as? UIButton { button.titleLabel?.font = font }
            if let input = view as? UITextField { input.font = font }
        }

        if shouldApply(style, "width", to: node, resolved: resolved) {
            node.widthConstraint?.isActive = false
            if let width = number(style, "width") {
                node.widthConstraint = view.widthAnchor.constraint(equalToConstant: width)
                node.widthConstraint?.isActive = true
            } else {
                node.widthConstraint = nil
            }
        }
        if shouldApply(style, "height", to: node, resolved: resolved) {
            node.heightConstraint?.isActive = false
            if let height = number(style, "height") {
                node.heightConstraint = view.heightAnchor.constraint(equalToConstant: height)
                node.heightConstraint?.isActive = true
            } else {
                node.heightConstraint = nil
            }
        }
    }

    private func applyNativeModifiers(_ modifiers: [[String: Any]], to node: StingNode) {
        guard let view = node.view else { return }
        let blur = modifiers.last { $0["name"] as? String == "blur" }
        guard blur != nil else {
            node.blurView?.removeFromSuperview()
            node.blurView = nil
            return
        }

        if node.blurView == nil {
            let effectView = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
            effectView.translatesAutoresizingMaskIntoConstraints = false
            effectView.isUserInteractionEnabled = false
            view.insertSubview(effectView, at: 0)
            NSLayoutConstraint.activate([
                effectView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                effectView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                effectView.topAnchor.constraint(equalTo: view.topAnchor),
                effectView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            node.blurView = effectView
        }
    }

    private func applyPadding(
        _ style: [String: Any],
        to stack: UIStackView,
        node: StingNode,
        resolved: Bool
    ) {
        guard shouldApplyPadding(style, to: node, resolved: resolved) else { return }
        let edges = paddingEdges(style)
        let margins = edges.map {
            NSDirectionalEdgeInsets(
                top: $0.top,
                leading: $0.left,
                bottom: $0.bottom,
                trailing: $0.right
            )
        } ?? node.originalStackMargins ?? .zero

        if let safeArea = stack as? StingSafeAreaStackView {
            safeArea.setContentMargins(margins)
            return
        }
        if let keyboardAvoiding = stack as? StingKeyboardAvoidingStackView {
            keyboardAvoiding.setContentMargins(margins)
            return
        }

        guard edges != nil else {
            stack.isLayoutMarginsRelativeArrangement = node.originalStackUsesMargins ?? false
            stack.directionalLayoutMargins = margins
            return
        }
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = margins
    }

    private func shouldApplyPadding(_ style: [String: Any], to node: StingNode, resolved: Bool) -> Bool {
        let keys = ["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]
        var apply = false
        for key in keys where shouldApply(style, key, to: node, resolved: resolved) {
            apply = true
        }
        return apply
    }

    private func paddingEdges(_ style: [String: Any]) -> UIEdgeInsets? {
        let shorthand = number(style, "padding")
        let hasEdge = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].contains {
            style[$0] != nil && !(style[$0] is NSNull)
        }
        guard shorthand != nil || hasEdge else { return nil }
        return UIEdgeInsets(
            top: number(style, "paddingTop") ?? shorthand ?? 0,
            left: number(style, "paddingLeft") ?? shorthand ?? 0,
            bottom: number(style, "paddingBottom") ?? shorthand ?? 0,
            right: number(style, "paddingRight") ?? shorthand ?? 0
        )
    }

    private func applyStackAlignment(
        _ style: [String: Any],
        to stack: UIStackView,
        node: StingNode,
        resolved: Bool
    ) {
        if shouldApply(style, "alignItems", to: node, resolved: resolved) {
            if let alignment = string(style, "alignItems") {
                switch alignment {
                case "center": stack.alignment = .center
                case "start": stack.alignment = stack.axis == .vertical ? .leading : .top
                case "end": stack.alignment = stack.axis == .vertical ? .trailing : .bottom
                default: stack.alignment = .fill
                }
            } else if let original = node.originalStackAlignment {
                stack.alignment = original
            }
        }
        if shouldApply(style, "justifyContent", to: node, resolved: resolved) {
            if let justify = string(style, "justifyContent") {
                switch justify {
                case "center": stack.distribution = .equalCentering
                default: stack.distribution = .fill
                }
            } else if let original = node.originalStackDistribution {
                stack.distribution = original
            }
        }
    }

    private func shouldApply(
        _ style: [String: Any],
        _ key: String,
        to node: StingNode,
        resolved: Bool
    ) -> Bool {
        if let value = style[key], !(value is NSNull) {
            node.styledKeys.insert(key)
            return true
        }
        if resolved, node.styledKeys.remove(key) != nil {
            return true
        }
        return false
    }

    private func number(_ style: [String: Any], _ key: String) -> CGFloat? {
        guard let value = style[key] as? NSNumber else { return nil }
        return CGFloat(truncating: value)
    }

    private func string(_ style: [String: Any], _ key: String) -> String? {
        style[key] as? String
    }

    private static func fontWeight(_ string: String?, number: NSNumber?) -> UIFont.Weight {
        if let number {
            switch number.intValue {
            case 700...: return .bold
            case 600...: return .semibold
            case 500...: return .medium
            default: return .regular
            }
        }
        switch string {
        case "bold": return .bold
        case "semibold": return .semibold
        case "medium": return .medium
        default: return .regular
        }
    }

    private static func parseModuleViewIdentity(_ type: String) throws -> (module: String, viewType: String)? {
        guard type.hasPrefix(moduleViewPrefix) else { return nil }
        let body = String(type.dropFirst(moduleViewPrefix.count))
        let pieces = body.split(separator: ":", omittingEmptySubsequences: false)
        guard pieces.count == 2 else {
            throw StingNativeModuleError(code: "E_INVALID_VIEW_TYPE", message: "Malformed Sting native module view type \(type)")
        }
        let module = String(pieces[0])
        let viewType = String(pieces[1])
        guard validModuleViewSegment(module), validModuleViewSegment(viewType) else {
            throw StingNativeModuleError(code: "E_INVALID_VIEW_TYPE", message: "Malformed Sting native module view type \(type)")
        }
        return (module, viewType)
    }

    private static func validModuleViewSegment(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", options: .regularExpression) != nil
    }

    private static func encodeJSONFragment(_ value: Any?) -> String {
        guard let data = try? JSONSerialization.data(
            withJSONObject: value ?? NSNull(),
            options: [.fragmentsAllowed]
        ), let string = String(data: data, encoding: .utf8) else { return "null" }
        return string
    }

    private static let moduleViewPrefix = "__sting_module_view__:"
    private static let accessibilityProperties: Set<String> = [
        "accessibilityLabel",
        "accessibilityHint",
        "accessibilityValue",
        "accessibilityRole",
        "accessibilityHidden",
        "focusable",
    ]
    private static let gestureEvents: Set<String> = ["tap", "longPress", "panStart", "pan", "panEnd"]
    private static let focusEvents: Set<String> = ["focus", "blur"]
    private static let appRootEvents: Set<String> = ["appear", "disappear", "appStateChange"]
}

private extension UIColor {
    convenience init?(stingHex value: String) {
        var hex = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard (hex.count == 6 || hex.count == 8), let integer = UInt64(hex, radix: 16) else { return nil }

        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        let alpha: CGFloat
        if hex.count == 8 {
            red = CGFloat((integer >> 24) & 0xff) / 255
            green = CGFloat((integer >> 16) & 0xff) / 255
            blue = CGFloat((integer >> 8) & 0xff) / 255
            alpha = CGFloat(integer & 0xff) / 255
        } else {
            red = CGFloat((integer >> 16) & 0xff) / 255
            green = CGFloat((integer >> 8) & 0xff) / 255
            blue = CGFloat(integer & 0xff) / 255
            alpha = 1
        }
        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }
}
