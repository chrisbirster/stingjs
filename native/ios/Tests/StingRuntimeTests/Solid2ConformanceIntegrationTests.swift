import JavaScriptCore
import UIKit
import XCTest
@testable import StingRuntime

final class Solid2ConformanceIntegrationTests: XCTestCase {
    func testSolidTwoConformanceSuiteRunsInJavaScriptCoreAgainstUIKitBridge() throws {
        let bundleURL = try requireBundle(named: "sting-solid2-conformance")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView)

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        runtime.context.evaluateScript(
            """
            globalThis.__stingConformanceNativeResult = null;
            globalThis.__stingSolid2Conformance.runAll().then(
              results => {
                let assertions = 0;
                let metrics = 0;
                for (const scenario of results) {
                  assertions += scenario.assertions.length;
                  metrics += scenario.metrics.length;
                }
                globalThis.__stingConformanceNativeResult = JSON.stringify({
                  ok: true,
                  scenarios: results.length,
                  assertions,
                  metrics
                });
              },
              error => {
                globalThis.__stingConformanceNativeResult = JSON.stringify({
                  ok: false,
                  error: String(error && (error.stack || error.message) || error)
                });
              }
            );
            """
        )

        guard let result = waitForConformanceResult(in: runtime, timeout: 20.0) else {
            XCTFail("Solid 2 conformance suite did not settle in JavaScriptCore")
            return
        }

        XCTAssertEqual(
            result["ok"] as? Bool,
            true,
            "Solid 2 conformance failure: \(result["error"] as? String ?? "unknown error")"
        )
        XCTAssertGreaterThanOrEqual(result["scenarios"] as? Int ?? 0, 1)
        XCTAssertGreaterThan(result["assertions"] as? Int ?? 0, 0)
        XCTAssertGreaterThan(result["metrics"] as? Int ?? 0, 0)
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

    private func waitForConformanceResult(
        in runtime: StingJavaScriptRuntime,
        timeout: TimeInterval
    ) -> [String: Any]? {
        let deadline = Date().addingTimeInterval(timeout)

        repeat {
            if let value = runtime.context.evaluateScript(
                "globalThis.__stingConformanceNativeResult"
            ),
               !value.isNull,
               !value.isUndefined,
               let encoded = value.toString(),
               let data = encoded.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data),
               let result = object as? [String: Any] {
                return result
            }

            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        } while Date() < deadline

        return nil
    }
}
