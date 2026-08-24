import XCTest
import UIKit
@testable import StingRuntime

final class StingRuntimeIntegrationTests: XCTestCase {
    private final class RecordingHapticsModule: StingNativeModule {
        let name = "Haptics"
        let version = "0.1.0"
        private(set) var calls: [(method: String, arguments: [Any])] = []

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            calls.append((method, arguments))
            return nil
        }
    }

    func testHelloWorldRoundTripsNativePressThroughSolidAndHaptics() throws {
        guard let bundleURL = Bundle.module.url(
            forResource: "sting-app",
            withExtension: "js",
            subdirectory: "Fixtures"
        ) else {
            XCTFail("Missing generated Fixtures/sting-app.js. Run scripts/test-ios-runtime.sh.")
            return
        }

        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let haptics = RecordingHapticsModule()
        let runtime = try StingJavaScriptRuntime(rootView: rootView, modules: [haptics])

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        guard let label = firstSubview(of: UILabel.self, in: rootView) else {
            XCTFail("Solid/Sting should mount a native UILabel")
            return
        }
        guard let button = firstSubview(of: StingButton.self, in: rootView) else {
            XCTFail("Solid/Sting should mount a native StingButton")
            return
        }

        XCTAssertEqual(label.text, "Count: 0")
        XCTAssertEqual(button.title(for: .normal), "Add")

        // Ignore initial mount work. From this point forward we want the exact
        // hot-path mutations caused by one native press.
        runtime.resetMutationCounts()

        // Swift-package XCTest runs without UIApplicationMain, so UIKit cannot
        // dispatch sendActions(for:) in this process. Verify the real UIKit
        // target/action wiring exists, then invoke the exact native event sink
        // installed on StingButton. Everything after UIKit dispatch remains the
        // production path: native event -> JS handler -> Solid flush -> native
        // text mutation + native module call.
        let pressActions = button.actions(forTarget: button, forControlEvent: .touchUpInside) ?? []
        XCTAssertTrue(pressActions.contains("handlePress"))
        XCTAssertNotNil(button.onPress)
        button.onPress?(button.nodeId)

        XCTAssertEqual(
            label.text,
            "Count: 1",
            "A native press should update exactly the mounted native text through Solid reactivity"
        )
        XCTAssertEqual(haptics.calls.count, 1)
        XCTAssertEqual(haptics.calls.first?.method, "impact")
        XCTAssertEqual(haptics.calls.first?.arguments.first as? String, "medium")

        let mutations = runtime.mutationCounts
        XCTAssertEqual(mutations.replaceText, 1, "One signal update should produce one native text mutation")
        XCTAssertEqual(mutations.createElement, 0, "Fine-grained updates must not recreate native elements")
        XCTAssertEqual(mutations.createTextNode, 0, "Fine-grained updates must not recreate text nodes")
        XCTAssertEqual(mutations.setProperty, 0, "Unrelated native properties must not be replayed")
        XCTAssertEqual(mutations.insertNode, 0, "Fine-grained text updates must not reinsert native nodes")
        XCTAssertEqual(mutations.removeNode, 0, "Fine-grained text updates must not remove native nodes")
        XCTAssertEqual(mutations.setEventEnabled, 0, "Existing event subscriptions must not be rebound")
    }

    private func firstSubview<View: UIView>(of type: View.Type, in root: UIView) -> View? {
        if let match = root as? View {
            return match
        }

        for child in root.subviews {
            if let match = firstSubview(of: type, in: child) {
                return match
            }
        }

        return nil
    }
}
