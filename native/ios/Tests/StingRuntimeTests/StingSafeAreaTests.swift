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
}
