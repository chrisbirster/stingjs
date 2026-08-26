import Foundation
import UIKit
import XCTest
@testable import StingRuntime

final class StingBenchmarkCaptureTests: XCTestCase {
    private static let warmupIterations = 5
    private static let sampleIterations = 30

    func testSparseAndDenseNativeRoundTripCapture() throws {
        let bundleURL = try requireBundle(named: "sting-benchmark")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(
            rootView: rootView,
            collectPerformanceDiagnostics: true
        )

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        guard let mountButton = firstButton(titled: "Mount 10k rows", in: rootView) else {
            XCTFail("Benchmark should expose the 10k-row mount action")
            return
        }
        mountButton.onPress?(mountButton.nodeId)

        guard let sparseButton = firstButton(titled: "Update row 4,281", in: rootView) else {
            XCTFail("Benchmark should expose the sparse update action")
            return
        }
        guard let denseButton = firstButton(titled: "Update 100 rows", in: rootView) else {
            XCTFail("Benchmark should expose the dense update action")
            return
        }
        guard let diagnostics = runtime.performanceDiagnostics else {
            XCTFail("Benchmark capture requires opt-in native diagnostics")
            return
        }

        for _ in 0..<Self.warmupIterations {
            sparseButton.onPress?(sparseButton.nodeId)
            denseButton.onPress?(denseButton.nodeId)
        }

        let sparse = capture(
            scenario: "sparse-10k-row-4281",
            button: sparseButton,
            runtime: runtime,
            diagnostics: diagnostics,
            expectedTextMutationsPerSample: 1
        )
        emitCapture(sparse)

        let dense = capture(
            scenario: "dense-10k-100-rows",
            button: denseButton,
            runtime: runtime,
            diagnostics: diagnostics,
            expectedTextMutationsPerSample: 100
        )
        emitCapture(dense)
    }

    private func capture(
        scenario: String,
        button: StingButton,
        runtime: StingJavaScriptRuntime,
        diagnostics: StingPerformanceDiagnostics,
        expectedTextMutationsPerSample: Int
    ) -> [String: Any] {
        diagnostics.reset()
        runtime.resetMutationCounts()

        for _ in 0..<Self.sampleIterations {
            button.onPress?(button.nodeId)
        }

        let snapshot = diagnostics.snapshot()
        let roundTripSamples = snapshot.samples(for: "event.press-round-trip")
        let replaceTextSamples = snapshot.samples(for: "bridge.replace-text")
        let expectedTextMutations = Self.sampleIterations * expectedTextMutationsPerSample
        let counts = runtime.mutationCounts

        XCTAssertEqual(roundTripSamples.count, Self.sampleIterations)
        XCTAssertEqual(replaceTextSamples.count, expectedTextMutations)
        XCTAssertEqual(counts.replaceText, expectedTextMutations)
        XCTAssertEqual(counts.createElement, 0)
        XCTAssertEqual(counts.createTextNode, 0)
        XCTAssertEqual(counts.setProperty, 0)
        XCTAssertEqual(counts.insertNode, 0)
        XCTAssertEqual(counts.removeNode, 0)
        XCTAssertEqual(counts.setEventEnabled, 0)

        return [
            "captureVersion": 1,
            "controlRuntime": "javascriptcore",
            "scenario": scenario,
            "metric": "native-event-to-native-commit-round-trip",
            "unit": "ms",
            "direction": "lower-is-better",
            "warmupIterations": Self.warmupIterations,
            "sampleCount": Self.sampleIterations,
            "samples": roundTripSamples,
            "nativeMutationMetric": "replaceText",
            "nativeMutationsPerSample": expectedTextMutationsPerSample,
            "nativeMutationCount": expectedTextMutations,
            "nativeMutationSamples": replaceTextSamples,
        ]
    }

    private func emitCapture(_ capture: [String: Any]) {
        XCTAssertTrue(JSONSerialization.isValidJSONObject(capture))
        guard let data = try? JSONSerialization.data(withJSONObject: capture, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8) else {
            XCTFail("Benchmark capture should encode as JSON")
            return
        }
        print("STING_BENCHMARK_CAPTURE=\(json)")
    }

    private func requireBundle(named name: String) throws -> URL {
        guard let url = Bundle.module.url(forResource: name, withExtension: "js", subdirectory: "Fixtures") else {
            throw XCTSkip("Missing bundled fixture \(name).js")
        }
        return url
    }

    private func firstButton(titled title: String, in view: UIView) -> StingButton? {
        if let button = view as? StingButton, button.title(for: .normal) == title {
            return button
        }
        for child in view.subviews {
            if let match = firstButton(titled: title, in: child) {
                return match
            }
        }
        return nil
    }
}
