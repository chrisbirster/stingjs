import XCTest
import UIKit
@testable import StingRuntime

final class StingStylingTests: XCTestCase {
    func testResolvedStyleAppliesAndResetsUIKitState() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)

        try nodes.createElement(id: 1, type: "view")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)

        try nodes.setProperty(
            id: 1,
            name: "style",
            valueJSON: """
            {
              "__stingResolved": true,
              "flexDirection": "row",
              "alignItems": "center",
              "justifyContent": "center",
              "gap": 12,
              "paddingTop": 16,
              "paddingRight": 8,
              "paddingBottom": 16,
              "paddingLeft": 8,
              "backgroundColor": "#112233",
              "borderRadius": 10,
              "opacity": 0.75
            }
            """
        )

        guard let stack = root.subviews.first as? UIStackView else {
            return XCTFail("styled view should mount as UIStackView")
        }
        XCTAssertEqual(stack.axis, .horizontal)
        XCTAssertEqual(stack.alignment, .center)
        XCTAssertEqual(stack.distribution, .equalCentering)
        XCTAssertEqual(stack.spacing, 12)
        XCTAssertEqual(stack.directionalLayoutMargins.top, 16)
        XCTAssertEqual(stack.directionalLayoutMargins.leading, 8)
        XCTAssertEqual(stack.layer.cornerRadius, 10)
        XCTAssertEqual(stack.alpha, 0.75)
        XCTAssertNotNil(stack.backgroundColor)

        try nodes.setProperty(
            id: 1,
            name: "style",
            valueJSON: """
            {
              "__stingResolved": true,
              "flexDirection": null,
              "alignItems": null,
              "justifyContent": null,
              "gap": null,
              "paddingTop": null,
              "paddingRight": null,
              "paddingBottom": null,
              "paddingLeft": null,
              "backgroundColor": null,
              "borderRadius": null,
              "opacity": null
            }
            """
        )

        XCTAssertEqual(stack.axis, .vertical)
        XCTAssertEqual(stack.alignment, .fill)
        XCTAssertEqual(stack.distribution, .fill)
        XCTAssertEqual(stack.spacing, 0)
        XCTAssertEqual(stack.layer.cornerRadius, 0)
        XCTAssertEqual(stack.alpha, 1)
    }

    func testNativeBlurIsInstalledAndRemoved() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)
        try nodes.createElement(id: 1, type: "view")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)

        try nodes.setProperty(
            id: 1,
            name: "nativeModifiers",
            valueJSON: "[{\"name\":\"blur\",\"value\":{\"radius\":16}}]"
        )

        guard let stack = root.subviews.first as? UIStackView else {
            return XCTFail("view should mount as UIStackView")
        }
        XCTAssertEqual(stack.subviews.filter { $0 is UIVisualEffectView }.count, 1)

        try nodes.setProperty(id: 1, name: "nativeModifiers", valueJSON: "[]")
        XCTAssertEqual(stack.subviews.filter { $0 is UIVisualEffectView }.count, 0)
    }
}
