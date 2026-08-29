import UIKit
import XCTest
@testable import StingRuntime

final class StingKeyboardAvoidingTests: XCTestCase {
    func testKeyboardInsetIsAdditiveWithContentMargins() {
        let view = StingKeyboardAvoidingStackView(frame: .zero)

        view.setContentMargins(NSDirectionalEdgeInsets(top: 5, leading: 4, bottom: 7, trailing: 6))
        view.applyKeyboardInsetForTesting(40)

        XCTAssertEqual(view.directionalLayoutMargins.top, 5)
        XCTAssertEqual(view.directionalLayoutMargins.leading, 4)
        XCTAssertEqual(view.directionalLayoutMargins.bottom, 47)
        XCTAssertEqual(view.directionalLayoutMargins.trailing, 6)

        view.setContentMargins(NSDirectionalEdgeInsets(top: 2, leading: 1, bottom: 4, trailing: 3))
        XCTAssertEqual(view.directionalLayoutMargins.bottom, 44)

        view.applyKeyboardInsetForTesting(0)
        XCTAssertEqual(view.directionalLayoutMargins.bottom, 4)
    }

    func testRegistryCreatesAndStylesKeyboardAvoidingHost() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)

        try nodes.createElement(id: 1, type: "keyboardavoidingview")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)

        guard let keyboardAvoiding = root.subviews.first as? StingKeyboardAvoidingStackView else {
            return XCTFail("keyboardavoidingview should mount as StingKeyboardAvoidingStackView")
        }

        try nodes.setProperty(
            id: 1,
            name: "style",
            valueJSON: """
            {
              "__stingResolved": true,
              "paddingTop": 8,
              "paddingRight": 8,
              "paddingBottom": 8,
              "paddingLeft": 8
            }
            """
        )
        keyboardAvoiding.applyKeyboardInsetForTesting(40)

        XCTAssertEqual(keyboardAvoiding.directionalLayoutMargins.leading, 8)
        XCTAssertEqual(keyboardAvoiding.directionalLayoutMargins.top, 8)
        XCTAssertEqual(keyboardAvoiding.directionalLayoutMargins.trailing, 8)
        XCTAssertEqual(keyboardAvoiding.directionalLayoutMargins.bottom, 48)
    }
}
