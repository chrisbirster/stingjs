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

        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)
    }

    func testTenThousandRowSparseAndDenseUpdatesPreserveFineGrainedNativeMutations() throws {
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
        guard let denseButton = firstButton(titled: "Update 100 rows", in: rootView) else {
            XCTFail("Benchmark should expose the dense row update action")
            return
        }

        XCTAssertEqual(targetLabel.text, "Row 4281: 0")

        // Mounting 10,000 rows is intentionally expensive and is measured
        // separately. Sparse/dense mutation invariants start only after the
        // complete native tree exists.
        runtime.resetMutationCounts()
        sparseButton.onPress?(sparseButton.nodeId)

        XCTAssertEqual(
            targetLabel.text,
            "Row 4281: 1",
            "Updating one logical row must update the corresponding mounted native UILabel"
        )
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)

        // The deterministic dense fixture includes row 4,281 and 99 other
        // unique rows. Solid should therefore schedule exactly 100 bound text
        // computations and Sting should emit exactly 100 native text mutations.
        runtime.resetMutationCounts()
        denseButton.onPress?(denseButton.nodeId)

        XCTAssertEqual(targetLabel.text, "Row 4281: 2")
        assertOnlyTextMutations(runtime.mutationCounts, expected: 100)
    }

    func testSolidTwoAsyncMemoLoadingPendingErrorAndRecoveryRenderIntoUIKit() throws {
        let bundleURL = try requireBundle(named: "sting-async-native")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        // Solid 2's async memo starts with an unresolved Promise. The native
        // renderer must therefore show the <Loading> fallback as a real UILabel
        // rather than exposing undefined or requiring Sting-specific loading state.
        XCTAssertEqual(
            waitForLabel(accessibilityLabel: "async-loading", in: rootView)?.text,
            "Loading..."
        )
        XCTAssertNil(label(accessibilityLabel: "async-value", in: rootView))

        evaluateJavaScript(
            "globalThis.__stingAsyncNative.resolve('alpha');",
            in: runtime
        )

        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-value",
                in: rootView,
                where: { $0.text == "Value: alpha" }
            )?.text,
            "Value: alpha"
        )
        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-pending",
                in: rootView,
                where: { $0.text == "Pending: no" }
            )?.text,
            "Pending: no"
        )
        XCTAssertNil(label(accessibilityLabel: "async-loading", in: rootView))

        // Changing the question should enter Solid 2's stale-while-pending
        // state. The already-mounted value must remain visible; only the
        // pending indicator should mutate while the next Promise is unresolved.
        runtime.resetMutationCounts()
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.beginRefresh();",
            in: runtime
        )

        XCTAssertEqual(label(accessibilityLabel: "async-value", in: rootView)?.text, "Value: alpha")
        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-pending",
                in: rootView,
                where: { $0.text == "Pending: yes" }
            )?.text,
            "Pending: yes"
        )
        XCTAssertNil(label(accessibilityLabel: "async-loading", in: rootView))
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)

        // Resolving the refresh should update the existing native value text and
        // clear the pending indicator without rebuilding the native subtree.
        runtime.resetMutationCounts()
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.resolve('beta');",
            in: runtime
        )

        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-value",
                in: rootView,
                where: { $0.text == "Value: beta" }
            )?.text,
            "Value: beta"
        )
        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-pending",
                in: rootView,
                where: { $0.text == "Pending: no" }
            )?.text,
            "Pending: no"
        )
        assertOnlyTextMutations(runtime.mutationCounts, expected: 2)

        // A rejected subsequent computation must enter Solid 2's <Errored>
        // boundary and surface the error through native UI.
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.beginRefresh();",
            in: runtime
        )
        _ = waitForLabel(
            accessibilityLabel: "async-pending",
            in: rootView,
            where: { $0.text == "Pending: yes" }
        )
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.reject('native async boom');",
            in: runtime
        )

        guard let errorLabel = waitForLabel(
            accessibilityLabel: "async-error",
            in: rootView,
            where: { $0.text?.contains("native async boom") == true }
        ) else {
            XCTFail("Solid 2 <Errored> should render the rejected async computation into UIKit")
            return
        }
        XCTAssertTrue(errorLabel.text?.contains("native async boom") == true)

        // Retrying starts a brand-new unresolved computation. With no stale
        // successful branch left behind after the error, <Loading> owns the UI
        // again until the replacement Promise resolves.
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.retry();",
            in: runtime
        )
        XCTAssertEqual(
            waitForLabel(accessibilityLabel: "async-loading", in: rootView)?.text,
            "Loading..."
        )

        evaluateJavaScript(
            "globalThis.__stingAsyncNative.resolve('gamma');",
            in: runtime
        )
        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-value",
                in: rootView,
                where: { $0.text == "Value: gamma" }
            )?.text,
            "Value: gamma"
        )
        XCTAssertEqual(
            waitForLabel(
                accessibilityLabel: "async-pending",
                in: rootView,
                where: { $0.text == "Pending: no" }
            )?.text,
            "Pending: no"
        )
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

    private func evaluateJavaScript(_ source: String, in runtime: StingJavaScriptRuntime) {
        runtime.context.evaluateScript(source)
    }

    private func label(accessibilityLabel: String, in root: UIView) -> UILabel? {
        firstSubview(of: UILabel.self, in: root) {
            $0.accessibilityLabel == accessibilityLabel
        }
    }

    private func waitForLabel(
        accessibilityLabel: String,
        in root: UIView,
        timeout: TimeInterval = 1.0,
        where predicate: (UILabel) -> Bool = { _ in true }
    ) -> UILabel? {
        let deadline = Date().addingTimeInterval(timeout)

        repeat {
            if let candidate = label(accessibilityLabel: accessibilityLabel, in: root),
               predicate(candidate) {
                return candidate
            }

            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        } while Date() < deadline

        return nil
    }

    private func assertOnlyTextMutations(
        _ mutations: StingBridgeMutationCounts,
        expected: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(
            mutations.replaceText,
            expected,
            "Reactive updates should emit only the expected native text mutations",
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
