import UIKit
import XCTest
@testable import StingRuntime

final class StingApplicationReliabilityTests: XCTestCase {
    func testRepeatedApplicationFrameworkTeardownSuppressesLateEvents() throws {
        for cycle in 0..<50 {
            let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
            let nodes = StingNodeRegistry(rootView: root)
            var events: [String] = []
            nodes.eventSink = { id, event, _ in events.append("\(id):\(event)") }

            try nodes.createElement(id: 1, type: "approot")
            try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
            try nodes.setEventEnabled(id: 1, event: "appear", enabled: true)
            try nodes.setEventEnabled(id: 1, event: "disappear", enabled: true)
            try nodes.setEventEnabled(id: 1, event: "appStateChange", enabled: true)
            guard let appRoot = root.subviews.last as? StingAppRootStackView else {
                return XCTFail("cycle \(cycle): approot should mount as StingAppRootStackView")
            }

            try nodes.createElement(id: 2, type: "focusview")
            try nodes.insertNode(parentId: 0, nodeId: 2, anchorId: -1)
            try nodes.setEventEnabled(id: 2, event: "focus", enabled: true)
            try nodes.setEventEnabled(id: 2, event: "blur", enabled: true)
            guard let focus = root.subviews.last as? StingFocusStackView else {
                return XCTFail("cycle \(cycle): focusview should mount as StingFocusStackView")
            }

            try nodes.createElement(id: 3, type: "gestureview")
            try nodes.insertNode(parentId: 0, nodeId: 3, anchorId: -1)
            try nodes.setEventEnabled(id: 3, event: "tap", enabled: true)
            guard let gesture = root.subviews.last as? StingGestureStackView else {
                return XCTFail("cycle \(cycle): gestureview should mount as StingGestureStackView")
            }

            try nodes.createElement(id: 4, type: "modal")
            try nodes.insertNode(parentId: 0, nodeId: 4, anchorId: -1)
            try nodes.setEventEnabled(id: 4, event: "dismiss", enabled: true)
            try nodes.setProperty(id: 4, name: "presented", valueJSON: "true")
            guard let modal = root.subviews.last as? StingPresentationHostView else {
                return XCTFail("cycle \(cycle): modal should mount as StingPresentationHostView")
            }

            try nodes.createElement(id: 5, type: "virtuallist")
            try nodes.insertNode(parentId: 0, nodeId: 5, anchorId: -1)
            try nodes.setProperty(id: 5, name: "itemExtent", valueJSON: "20")
            try nodes.setProperty(id: 5, name: "overscan", valueJSON: "1")
            for index in 0..<20 {
                let id = 100 + index
                try nodes.createElement(id: id, type: "view")
                try nodes.insertNode(parentId: 5, nodeId: id, anchorId: -1)
            }
            guard let list = root.subviews.last as? StingVirtualListView else {
                return XCTFail("cycle \(cycle): virtuallist should mount as StingVirtualListView")
            }

            appRoot.emitAppearForTesting(true)
            appRoot.emitStateForTesting("background")
            appRoot.emitAppearForTesting(false)
            focus.emitFocusForTesting(true)
            focus.emitFocusForTesting(false)
            gesture.emitForTesting(event: "tap", payload: ["x": 1.0, "y": 1.0, "touches": 1])
            modal.simulateDismissForTesting()
            list.updateViewportForTesting(offset: 100, height: 40)

            XCTAssertFalse(
                list.activeIndicesForTesting.isEmpty,
                "cycle \(cycle) should mount a virtualized window"
            )
            XCTAssertGreaterThanOrEqual(
                events.count,
                7,
                "cycle \(cycle) should emit framework events before disposal"
            )
            let eventCountAtDispose = events.count

            nodes.dispose()
            nodes.dispose()

            appRoot.emitAppearForTesting(true)
            appRoot.emitStateForTesting("active")
            focus.emitFocusForTesting(true)
            gesture.emitForTesting(event: "tap", payload: ["x": 2.0, "y": 2.0, "touches": 1])
            modal.simulateDismissForTesting()
            list.updateViewportForTesting(offset: 0, height: 40)

            XCTAssertEqual(
                events.count,
                eventCountAtDispose,
                "cycle \(cycle) must suppress late events after registry disposal"
            )
            XCTAssertTrue(
                list.activeIndicesForTesting.isEmpty,
                "cycle \(cycle) must clear virtual-list attachment state during disposal"
            )
        }
    }
}
