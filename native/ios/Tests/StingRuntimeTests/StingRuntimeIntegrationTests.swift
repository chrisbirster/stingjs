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
        guard let button = firstButton(titled: "Add", in: rootView) else {
            XCTFail("Solid/Sting should mount the native Add button")
            return
        }

        XCTAssertEqual(label.text, "Count: 0")
        XCTAssertEqual(button.title(for: .normal), "Add")

        runtime.resetMutationCounts()

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

        runtime.resetMutationCounts()
        sparseButton.onPress?(sparseButton.nodeId)

        XCTAssertEqual(
            targetLabel.text,
            "Row 4281: 1",
            "Updating one logical row must update the corresponding mounted native UILabel"
        )
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)

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

        guard let retryButton = firstButton(titled: "Retry", in: rootView) else {
            XCTFail("Solid 2 <Errored> fallback should expose the native Retry button")
            return
        }
        let retryActions = retryButton.actions(forTarget: retryButton, forControlEvent: .touchUpInside) ?? []
        XCTAssertTrue(retryActions.contains("handlePress"))
        XCTAssertNotNil(retryButton.onPress)

        retryButton.onPress?(retryButton.nodeId)
        XCTAssertTrue(
            label(accessibilityLabel: "async-error", in: rootView)?.text?.contains("native async boom") == true
        )
        XCTAssertNil(label(accessibilityLabel: "async-loading", in: rootView))
        XCTAssertNil(label(accessibilityLabel: "async-value", in: rootView))
        XCTAssertNil(label(accessibilityLabel: "async-pending", in: rootView))

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
        XCTAssertNil(label(accessibilityLabel: "async-error", in: rootView))
        XCTAssertNil(firstButton(titled: "Retry", in: rootView))
    }

    func testSolidTwoAsyncIterableStreamsFineGrainedUpdatesIntoUIKit() throws {
        let bundleURL = try requireBundle(named: "sting-async-native")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        XCTAssertEqual(
            waitForLabel(accessibilityLabel: "stream-loading", in: rootView)?.text,
            "Stream loading..."
        )
        XCTAssertNil(label(accessibilityLabel: "stream-value", in: rootView))

        evaluateJavaScript(
            "globalThis.__stingAsyncNative.streamYield('one');",
            in: runtime
        )

        guard let streamLabel = waitForLabel(
            accessibilityLabel: "stream-value",
            in: rootView,
            where: { $0.text == "Stream: one" }
        ) else {
            XCTFail("The first AsyncIterable yield should reveal a native stream UILabel")
            return
        }
        XCTAssertNil(label(accessibilityLabel: "stream-loading", in: rootView))

        runtime.resetMutationCounts()
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.streamYield('two');",
            in: runtime
        )

        guard let updatedStreamLabel = waitForLabel(
            accessibilityLabel: "stream-value",
            in: rootView,
            where: { $0.text == "Stream: two" }
        ) else {
            XCTFail("The second AsyncIterable yield should update the native stream UILabel")
            return
        }

        XCTAssertTrue(
            streamLabel === updatedStreamLabel,
            "Streaming updates should preserve the mounted native UILabel identity"
        )
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)
    }

    func testSolidTwoActionOptimisticStateAppliesAndRollsBackInUIKit() throws {
        let bundleURL = try requireBundle(named: "sting-async-native")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        guard let actionLabel = waitForLabel(
            accessibilityLabel: "action-value",
            in: rootView,
            where: { $0.text == "Optimistic: 0" }
        ) else {
            XCTFail("The optimistic action fixture should mount its native value UILabel")
            return
        }
        guard let actionButton = firstButton(titled: "Optimistic +1", in: rootView) else {
            XCTFail("The optimistic action fixture should expose a native button")
            return
        }

        let actions = actionButton.actions(forTarget: actionButton, forControlEvent: .touchUpInside) ?? []
        XCTAssertTrue(actions.contains("handlePress"))
        XCTAssertNotNil(actionButton.onPress)

        // createOptimistic is the one write that is intentionally visible while
        // an action is in flight. A native press should reveal it immediately
        // without rebuilding or replaying unrelated native state.
        runtime.resetMutationCounts()
        actionButton.onPress?(actionButton.nodeId)

        guard let optimisticLabel = waitForLabel(
            accessibilityLabel: "action-value",
            in: rootView,
            where: { $0.text == "Optimistic: 1" }
        ) else {
            XCTFail("The in-flight action should immediately reveal optimistic native state")
            return
        }
        XCTAssertTrue(actionLabel === optimisticLabel)
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)

        // Once the yielded async work settles, Solid owns the optimistic
        // rollback. The same UILabel must return to its committed value with
        // exactly one native text write and no structural reconciliation.
        runtime.resetMutationCounts()
        evaluateJavaScript(
            "globalThis.__stingAsyncNative.resolveAction();",
            in: runtime
        )

        guard let rolledBackLabel = waitForLabel(
            accessibilityLabel: "action-value",
            in: rootView,
            where: { $0.text == "Optimistic: 0" }
        ) else {
            XCTFail("Settling the action should roll optimistic native state back")
            return
        }
        XCTAssertTrue(actionLabel === rolledBackLabel)
        assertOnlyTextMutations(runtime.mutationCounts, expected: 1)
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
