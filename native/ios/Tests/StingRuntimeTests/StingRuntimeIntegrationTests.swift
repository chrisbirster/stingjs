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
        let bundleURL = try requireBundle(named: "sting-app")
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

        assertSingleTextMutation(runtime.mutationCounts)
    }

    func testSparseTenThousandRowUpdateMutatesOnlyTargetNativeText() throws {
        let bundleURL = try requireBundle(named: "sting-benchmark")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        guard let mountButton = firstButton(titled: "Mount 10k rows", in: rootView) else {
            XCTFail("Benchmark should expose the 10k-row mount action")
            return
        }

        mountButton.onPress?(mountButton.nodeId)

        guard let targetLabel = firstSubview(
            of: UILabel.self,
            in: rootView,
            where: { $0.accessibilityLabel == "benchmark-row-4281" }
        ) else {
            XCTFail("Benchmark should mount native row 4,281")
            return
        }
        guard let sparseButton = firstButton(titled: "Update row 4,281", in: rootView) else {
            XCTFail("Benchmark should expose the sparse row update action")
            return
        }

        XCTAssertEqual(targetLabel.text, "Row 4281: 0")

        // Mounting 10,000 rows is intentionally expensive and is measured
        // separately. The sparse-update invariant starts only after the full
        // native tree exists.
        runtime.resetMutationCounts()
        sparseButton.onPress?(sparseButton.nodeId)

        XCTAssertEqual(
            targetLabel.text,
            "Row 4281: 1",
            "Updating one logical row must update the corresponding mounted native UILabel"
        )
        assertSingleTextMutation(runtime.mutationCounts)
    }

    private func requireBundle(named name: String) throws -> URL {
        guard let bundleURL = Bundle.module.url(
            forResource: name,
            withExtension: "js",
            subdirectory: "Fixtures"
        ) else {
            XCTFail("Missing generated Fixtures/\(name).js. Run scripts/test-ios-runtime.sh.")
            throw StingRuntimeError("Missing generated benchmark bundle: \(name).js")
        }
        return bundleURL
    }

    private func assertSingleTextMutation(
        _ mutations: StingBridgeMutationCounts,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(
            mutations.replaceText,
            1,
            "One signal update should produce one native text mutation",
            file: file,
            line: line
        )
        XCTAssertEqual(mutations.createElement, 0, file: file, line: line)
        XCTAssertEqual(mutations.createTextNode, 0, file: file, line: line)
        XCTAssertEqual(mutations.setProperty, 0, file: file, line: line)
        XCTAssertEqual(mutations.insertNode, 0, file: file, line: line)
        XCTAssertEqual(mutations.removeNode, 0, file: file, line: line)
        XCTAssertEqual(mutations.setEventEnabled, 0, file: file, line: line)
    }

    private func firstButton(titled title: String, in root: UIView) -> StingButton? {
        firstSubview(of: StingButton.self, in: root) { button in
            button.title(for: .normal) == title
        }
    }

    private func firstSubview<View: UIView>(
        of type: View.Type,
        in root: UIView,
        where predicate: (View) -> Bool = { _ in true }
    ) -> View? {
        if let match = root as? View, predicate(match) {
            return match
        }

        for child in root.subviews {
            if let match = firstSubview(of: type, in: child, where: predicate) {
                return match
            }
        }

        return nil
    }
}
