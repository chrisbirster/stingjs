import UIKit
import XCTest
@testable import StingRuntime

final class StingGestureTests: XCTestCase {
    func testGestureHandlersUsePlainValuePayloadsAndCanBeDisabled() throws {
        let view = StingGestureStackView(frame: .zero)
        var events: [(String, [String: Any])] = []

        try view.setGestureEventEnabled(event: "tap", enabled: true) {
            events.append(("tap", $0))
        }
        try view.setGestureEventEnabled(event: "pan", enabled: true) {
            events.append(("pan", $0))
        }

        view.emitForTesting(event: "tap", payload: ["x": 12.0, "y": 20.0, "touches": 1])
        view.emitForTesting(
            event: "pan",
            payload: [
                "x": 20.0,
                "y": 30.0,
                "translationX": 8.0,
                "translationY": 10.0,
                "velocityX": 120.0,
                "velocityY": 80.0,
                "touches": 1,
                "cancelled": false,
            ]
        )

        XCTAssertEqual(events.map(\.0), ["tap", "pan"])
        XCTAssertEqual(events[0].1["x"] as? Double, 12.0)
        XCTAssertEqual(events[1].1["translationX"] as? Double, 8.0)

        try view.setGestureEventEnabled(event: "tap", enabled: false, handler: { _ in })
        view.emitForTesting(event: "tap", payload: ["x": 1.0, "y": 1.0, "touches": 1])
        XCTAssertEqual(events.count, 2)
    }
}
