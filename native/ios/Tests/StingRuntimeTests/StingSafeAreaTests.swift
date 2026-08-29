import UIKit
import XCTest
@testable import StingRuntime

final class StingSafeAreaTests: XCTestCase {
    func testSafeAreaInsetsAreAdditiveWithContentMargins() {
        let view = StingSafeAreaStackView(frame: .zero)

        view.setContentMargins(NSDirectionalEdgeInsets(top: 5, leading: 4, bottom: 7, trailing: 6))
        view.applySafeAreaInsetsForTesting(UIEdgeInsets(top: 20, left: 10, bottom: 40, right: 30))

        XCTAssertEqual(view.directionalLayoutMargins.top, 25)
        XCTAssertEqual(view.directionalLayoutMargins.leading, 14)
        XCTAssertEqual(view.directionalLayoutMargins.bottom, 47)
        XCTAssertEqual(view.directionalLayoutMargins.trailing, 36)

        // A later reactive style update must preserve the current UIKit safe-area values.
        view.setContentMargins(NSDirectionalEdgeInsets(top: 2, leading: 1, bottom: 4, trailing: 3))
        XCTAssertEqual(view.directionalLayoutMargins.top, 22)
        XCTAssertEqual(view.directionalLayoutMargins.leading, 11)
        XCTAssertEqual(view.directionalLayoutMargins.bottom, 44)
        XCTAssertEqual(view.directionalLayoutMargins.trailing, 33)
    }

    func testRegistryCreatesAndStylesSafeAreaHost() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)

        try nodes.createElement(id: 1, type: "safearea")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)

        guard let safeArea = root.subviews.first as? StingSafeAreaStackView else {
            return XCTFail("safearea should mount as StingSafeAreaStackView")
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
        safeArea.applySafeAreaInsetsForTesting(UIEdgeInsets(top: 20, left: 2, bottom: 30, right: 3))

        XCTAssertEqual(safeArea.directionalLayoutMargins.leading, 10)
        XCTAssertEqual(safeArea.directionalLayoutMargins.top, 28)
        XCTAssertEqual(safeArea.directionalLayoutMargins.trailing, 11)
        XCTAssertEqual(safeArea.directionalLayoutMargins.bottom, 38)
    }
}
