import JavaScriptCore
import UIKit
import XCTest
@testable import StingRuntime

final class Solid2ControlFlowConformanceTests: XCTestCase {
    func testControlFlowConformanceRunsThroughJavaScriptCoreAndUIKit() throws {
        let bundleURL = try requireBundle(named: "sting-solid2-conformance")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)
        runtime.resetMutationCounts()

        runtime.context.evaluateScript(
            """
            globalThis.__stingControlFlowNativeResult = null;
            globalThis.__stingSolid2Conformance.run('control-flow').then(
              result => {
                globalThis.__stingControlFlowNativeResult = JSON.stringify({ ok: true, result });
              },
              error => {
                globalThis.__stingControlFlowNativeResult = JSON.stringify({
                  ok: false,
                  error: String(error && error.stack ? error.stack : error)
                });
              }
            );
            """
        )

        guard let resultJSON = waitForJavaScriptString(
            "globalThis.__stingControlFlowNativeResult",
            in: runtime
        ) else {
            XCTFail("Solid 2 control-flow conformance did not settle in JavaScriptCore")
            return
        }

        let data = Data(resultJSON.utf8)
        guard
            let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let ok = envelope["ok"] as? Bool
        else {
            XCTFail("Control-flow conformance returned malformed JSON: \(resultJSON)")
            return
        }

        if !ok {
            XCTFail("Control-flow conformance failed in JavaScriptCore: \(envelope["error"] ?? "unknown error")")
            return
        }

        guard
            let result = envelope["result"] as? [String: Any],
            let assertions = result["assertions"] as? [[String: Any]],
            let metrics = result["metrics"] as? [[String: Any]]
        else {
            XCTFail("Control-flow conformance result was missing assertions or metrics")
            return
        }

        let failures = assertions.filter { ($0["passed"] as? Bool) != true }
        XCTAssertGreaterThan(assertions.count, 50)
        XCTAssertTrue(
            failures.isEmpty,
            "Every control-flow assertion must pass in JavaScriptCore/UIKit: \(failures)"
        )

        XCTAssertEqual(metric(named: "native-bridge-forwarded", in: metrics), 1)
        XCTAssertEqual(metric(named: "rapid-branch.samples", in: metrics), 20)
        XCTAssertEqual(metric(named: "rapid-branch.native.createElement", in: metrics), 1000)
        XCTAssertEqual(metric(named: "rapid-branch.native.createTextNode", in: metrics), 0)
        XCTAssertEqual(metric(named: "rapid-branch.native.replaceText", in: metrics), 0)
        XCTAssertEqual(metric(named: "rapid-branch.native.setProperty", in: metrics), 0)
        XCTAssertEqual(metric(named: "rapid-branch.native.insertNode", in: metrics), 1000)
        XCTAssertEqual(metric(named: "rapid-branch.native.removeNode", in: metrics), 1000)
        XCTAssertEqual(metric(named: "rapid-branch.native.setEventEnabled", in: metrics), 2000)

        let mutations = runtime.mutationCounts
        XCTAssertGreaterThanOrEqual(mutations.createElement, 1000)
        XCTAssertGreaterThanOrEqual(mutations.insertNode, 1000)
        XCTAssertGreaterThanOrEqual(mutations.removeNode, 1000)
        XCTAssertGreaterThanOrEqual(mutations.setEventEnabled, 2000)

        XCTAssertTrue(
            rootView.subviews.isEmpty,
            "The control-flow scenario disposes its Solid root and must leave no UIKit app root mounted"
        )
    }

    private func requireBundle(named name: String) throws -> URL {
        guard let bundleURL = Bundle.module.url(
            forResource: name,
            withExtension: "js",
            subdirectory: "Fixtures"
        ) else {
            XCTFail("Missing generated Fixtures/\(name).js. Run scripts/test-ios-runtime.sh.")
            throw StingRuntimeError("Missing generated conformance bundle: \(name).js")
        }
        return bundleURL
    }

    private func waitForJavaScriptString(
        _ expression: String,
        in runtime: StingJavaScriptRuntime,
        timeout: TimeInterval = 2.0
    ) -> String? {
        let deadline = Date().addingTimeInterval(timeout)

        repeat {
            if let value = runtime.context.evaluateScript(expression),
               !value.isNull,
               !value.isUndefined,
               let string = value.toString() {
                return string
            }

            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        } while Date() < deadline

        return nil
    }

    private func metric(named name: String, in metrics: [[String: Any]]) -> Int? {
        guard let metric = metrics.first(where: { ($0["name"] as? String) == name }) else {
            return nil
        }

        if let value = metric["value"] as? Int {
            return value
        }
        if let value = metric["value"] as? NSNumber {
            return value.intValue
        }
        return nil
    }
}
