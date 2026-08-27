import XCTest
import UIKit
@testable import StingRuntime

final class StingPrimitiveParityTests: XCTestCase {
    func testImageTextInputAndScrollViewUseRealUIKitControls() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)

        try nodes.createElement(id: 1, type: "scrollview")
        try nodes.createElement(id: 2, type: "view")
        try nodes.createElement(id: 3, type: "image")
        try nodes.createElement(id: 4, type: "textinput")
        try nodes.insertNode(parentId: 2, nodeId: 3, anchorId: -1)
        try nodes.insertNode(parentId: 2, nodeId: 4, anchorId: -1)
        try nodes.insertNode(parentId: 1, nodeId: 2, anchorId: -1)
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)

        try nodes.setProperty(id: 1, name: "horizontal", valueJSON: "false")
        try nodes.setProperty(id: 3, name: "source", valueJSON: "\"missing-test-asset\"")
        try nodes.setProperty(id: 3, name: "resizeMode", valueJSON: "\"cover\"")
        try nodes.setProperty(id: 3, name: "accessibilityLabel", valueJSON: "\"Avatar\"")
        try nodes.setProperty(id: 4, name: "value", valueJSON: "\"Ada\"")
        try nodes.setProperty(id: 4, name: "placeholder", valueJSON: "\"Name\"")
        try nodes.setProperty(id: 4, name: "editable", valueJSON: "true")

        guard let scroll = firstSubview(of: StingScrollView.self, in: root) else {
            return XCTFail("ScrollView should mount a real UIScrollView")
        }
        guard let image = firstSubview(of: UIImageView.self, in: root) else {
            return XCTFail("Image should mount a real UIImageView")
        }
        guard let input = firstSubview(of: StingTextInput.self, in: root) else {
            return XCTFail("TextInput should mount a real UITextField")
        }

        XCTAssertEqual(scroll.contentStack.axis, .vertical)
        XCTAssertEqual(image.contentMode, .scaleAspectFill)
        XCTAssertEqual(image.accessibilityLabel, "Avatar")
        XCTAssertEqual(input.text, "Ada")
        XCTAssertEqual(input.placeholder, "Name")
        XCTAssertTrue(input.isEnabled)

        var events: [(Int, String, String)] = []
        nodes.eventSink = { events.append(($0, $1, $2)) }
        try nodes.setEventEnabled(id: 4, event: "changeText", enabled: true)
        input.text = "Grace"
        input.handleEditingChanged()
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events.first?.0, 4)
        XCTAssertEqual(events.first?.1, "changeText")
        XCTAssertEqual(events.first?.2, "\"Grace\"")

        // Controlled updates must not synthesize another native change event.
        try nodes.setProperty(id: 4, name: "value", valueJSON: "\"Lin\"")
        XCTAssertEqual(input.text, "Lin")
        XCTAssertEqual(events.count, 1)

        try nodes.setProperty(id: 1, name: "horizontal", valueJSON: "true")
        XCTAssertEqual(scroll.contentStack.axis, .horizontal)
    }

    private func firstSubview<T: UIView>(of type: T.Type, in root: UIView) -> T? {
        if let match = root as? T { return match }
        for child in root.subviews {
            if let match = firstSubview(of: type, in: child) { return match }
        }
        return nil
    }
}
