import UIKit
import XCTest
@testable import StingRuntime

final class StingNavigationStackTests: XCTestCase {
    func testNavigationStackShowsOnlyTopScreenAndFillsByDefault() {
        let navigation = StingNavigationStackView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let first = UIView(frame: .zero)
        let second = UIView(frame: .zero)

        navigation.addSubview(first)
        navigation.addSubview(second)
        navigation.layoutIfNeeded()

        XCTAssertTrue(first.isHidden)
        XCTAssertFalse(second.isHidden)
        XCTAssertEqual(first.frame, navigation.bounds)
        XCTAssertEqual(second.frame, navigation.bounds)

        var backCount = 0
        navigation.setBackHandler(enabled: true) { backCount += 1 }
        XCTAssertTrue(navigation.requestBack())
        XCTAssertEqual(backCount, 1)

        second.removeFromSuperview()
        navigation.refreshVisibleScreen()
        XCTAssertFalse(first.isHidden)
        XCTAssertFalse(navigation.requestBack())
    }

    func testRegistryRoutesBackToDeepestActiveStackThenBubbles() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)
        var events: [Int] = []
        nodes.eventSink = { nodeId, event, _ in
            if event == "back" { events.append(nodeId) }
        }

        // Outer stack: screen 2 is retained but hidden, screen 3 is active.
        try nodes.createElement(id: 1, type: "navigationstack")
        try nodes.createElement(id: 2, type: "view")
        try nodes.createElement(id: 3, type: "view")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
        try nodes.insertNode(parentId: 1, nodeId: 2, anchorId: -1)
        try nodes.insertNode(parentId: 1, nodeId: 3, anchorId: -1)
        try nodes.setEventEnabled(id: 1, event: "back", enabled: true)

        // Hidden screen owns a deeper stack that must never steal back.
        try nodes.createElement(id: 7, type: "navigationstack")
        try nodes.createElement(id: 8, type: "view")
        try nodes.createElement(id: 9, type: "view")
        try nodes.insertNode(parentId: 2, nodeId: 7, anchorId: -1)
        try nodes.insertNode(parentId: 7, nodeId: 8, anchorId: -1)
        try nodes.insertNode(parentId: 7, nodeId: 9, anchorId: -1)
        try nodes.setEventEnabled(id: 7, event: "back", enabled: true)

        // Active screen owns its own nested stack, which gets first refusal.
        try nodes.createElement(id: 4, type: "navigationstack")
        try nodes.createElement(id: 5, type: "view")
        try nodes.createElement(id: 6, type: "view")
        try nodes.insertNode(parentId: 3, nodeId: 4, anchorId: -1)
        try nodes.insertNode(parentId: 4, nodeId: 5, anchorId: -1)
        try nodes.insertNode(parentId: 4, nodeId: 6, anchorId: -1)
        try nodes.setEventEnabled(id: 4, event: "back", enabled: true)

        guard let outer = root.subviews.first as? StingNavigationStackView,
              let firstScreen = outer.subviews.first,
              let activeScreen = outer.subviews.last else {
            return XCTFail("navigation stack should mount its native screens")
        }
        XCTAssertTrue(firstScreen.isHidden)
        XCTAssertFalse(activeScreen.isHidden)

        XCTAssertTrue(nodes.requestBack())
        XCTAssertEqual(events, [4])

        // Once the nested stack reaches its root, back bubbles to the outer stack.
        try nodes.removeNode(parentId: 4, nodeId: 6)
        XCTAssertTrue(nodes.requestBack())
        XCTAssertEqual(events, [4, 1])

        // Solid owns the actual pop. Removing the outer top reveals the retained screen.
        try nodes.removeNode(parentId: 1, nodeId: 3)
        XCTAssertEqual(outer.subviews.count, 1)
        XCTAssertFalse(outer.subviews[0].isHidden)
    }

    func testRuntimeHostExposesHandledBackWithoutOwningRouteState() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let host = try StingNativeRuntimeHost(rootView: root)
        var events: [(Int, String)] = []
        host.nodeEventSink = { nodeId, event, _ in events.append((nodeId, event)) }

        try host.createElement(id: 1, type: "navigationstack")
        try host.createElement(id: 2, type: "view")
        try host.createElement(id: 3, type: "view")
        try host.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
        try host.insertNode(parentId: 1, nodeId: 2, anchorId: -1)
        try host.insertNode(parentId: 1, nodeId: 3, anchorId: -1)
        try host.setEventEnabled(id: 1, event: "back", enabled: true)

        XCTAssertTrue(host.requestBack())
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].0, 1)
        XCTAssertEqual(events[0].1, "back")

        try host.removeNode(parentId: 1, nodeId: 3)
        XCTAssertFalse(host.requestBack())
    }
}
