import UIKit
import XCTest
@testable import StingRuntime

final class StingApplicationFrameworkTests: XCTestCase {
    func testPresentationHostsKeepDeclarativeStateAndDismissEvents() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)
        var events: [String] = []
        nodes.eventSink = { _, event, _ in events.append(event) }

        try nodes.createElement(id: 1, type: "modal")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
        try nodes.setEventEnabled(id: 1, event: "dismiss", enabled: true)
        try nodes.setProperty(id: 1, name: "presented", valueJSON: "true")

        guard let modal = root.subviews.first as? StingPresentationHostView else {
            return XCTFail("modal should mount as StingPresentationHostView")
        }
        XCTAssertTrue(modal.isRequestedPresentedForTesting)
        modal.simulateDismissForTesting()
        XCTAssertEqual(events, ["dismiss"])
        XCTAssertFalse(modal.isRequestedPresentedForTesting)

        try nodes.createElement(id: 2, type: "sheet")
        try nodes.insertNode(parentId: 0, nodeId: 2, anchorId: -1)
        guard let sheet = root.subviews.last as? StingPresentationHostView else {
            return XCTFail("sheet should mount as StingPresentationHostView")
        }
        XCTAssertEqual(sheet.kind, "sheet")
    }

    func testVirtualListOnlyMountsViewportWindowPlusOverscan() throws {
        let list = StingVirtualListView(frame: CGRect(x: 0, y: 0, width: 320, height: 200))
        try list.setItemExtent(50)
        list.setOverscan(1)
        for index in 0..<10 {
            list.insertItem(UILabel(), at: index)
        }

        list.updateViewportForTesting(offset: 0, height: 100)
        XCTAssertEqual(list.activeIndicesForTesting, [0, 1, 2])

        list.updateViewportForTesting(offset: 250, height: 100)
        XCTAssertEqual(list.activeIndicesForTesting, [4, 5, 6, 7])
    }

    func testRegistryVirtualListTracksInsertAndRemove() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let nodes = StingNodeRegistry(rootView: root)
        try nodes.createElement(id: 1, type: "virtuallist")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
        try nodes.setProperty(id: 1, name: "itemExtent", valueJSON: "50")
        try nodes.setProperty(id: 1, name: "overscan", valueJSON: "0")

        for id in 2...5 {
            try nodes.createElement(id: id, type: "view")
            try nodes.insertNode(parentId: 1, nodeId: id, anchorId: -1)
        }

        guard let list = root.subviews.first as? StingVirtualListView else {
            return XCTFail("virtuallist should mount as StingVirtualListView")
        }
        list.updateViewportForTesting(offset: 0, height: 50)
        XCTAssertEqual(list.activeIndicesForTesting, [0])

        try nodes.removeNode(parentId: 1, nodeId: 2)
        list.updateViewportForTesting(offset: 0, height: 50)
        XCTAssertEqual(list.activeIndicesForTesting, [0])
    }

    func testAccessibilityFocusAndLifecycleUseSharedEventSink() throws {
        let root = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let nodes = StingNodeRegistry(rootView: root)
        var events: [(String, String)] = []
        nodes.eventSink = { _, event, payload in events.append((event, payload)) }

        try nodes.createElement(id: 1, type: "focusview")
        try nodes.insertNode(parentId: 0, nodeId: 1, anchorId: -1)
        try nodes.setProperty(id: 1, name: "accessibilityLabel", valueJSON: "\"Search\"")
        try nodes.setProperty(id: 1, name: "accessibilityHint", valueJSON: "\"Opens search\"")
        try nodes.setProperty(id: 1, name: "accessibilityRole", valueJSON: "\"button\"")
        try nodes.setProperty(id: 1, name: "accessibilityHidden", valueJSON: "true")
        try nodes.setProperty(id: 1, name: "focusable", valueJSON: "true")
        try nodes.setEventEnabled(id: 1, event: "focus", enabled: true)
        try nodes.setEventEnabled(id: 1, event: "blur", enabled: true)

        guard let focus = root.subviews.first as? StingFocusStackView else {
            return XCTFail("focusview should mount as StingFocusStackView")
        }
        XCTAssertEqual(focus.accessibilityLabel, "Search")
        XCTAssertEqual(focus.accessibilityHint, "Opens search")
        XCTAssertTrue(focus.accessibilityTraits.contains(.button))
        XCTAssertTrue(focus.accessibilityElementsHidden)
        focus.emitFocusForTesting(true)
        focus.emitFocusForTesting(false)

        try nodes.createElement(id: 2, type: "approot")
        try nodes.insertNode(parentId: 0, nodeId: 2, anchorId: -1)
        try nodes.setEventEnabled(id: 2, event: "appear", enabled: true)
        try nodes.setEventEnabled(id: 2, event: "disappear", enabled: true)
        try nodes.setEventEnabled(id: 2, event: "appStateChange", enabled: true)

        guard let appRoot = root.subviews.last as? StingAppRootStackView else {
            return XCTFail("approot should mount as StingAppRootStackView")
        }
        appRoot.emitAppearForTesting(true)
        appRoot.emitStateForTesting("background")
        appRoot.emitAppearForTesting(false)

        XCTAssertTrue(events.contains { $0.0 == "focus" })
        XCTAssertTrue(events.contains { $0.0 == "blur" })
        XCTAssertTrue(events.contains { $0.0 == "appear" })
        XCTAssertTrue(events.contains { $0.0 == "disappear" })
        XCTAssertTrue(events.contains { $0.0 == "appStateChange" && $0.1.contains("background") })
    }
}
