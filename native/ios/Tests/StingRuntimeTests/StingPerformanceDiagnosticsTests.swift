import UIKit
import XCTest
@testable import StingRuntime

final class StingPerformanceDiagnosticsTests: XCTestCase {
    private final class RecordingModule: StingNativeModule {
        let name = "Benchmark"
        let version = "0.1.0"
        private(set) var calls = 0

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            calls += 1
            return method == "ping" ? "pong" : nil
        }
    }

    func testRecorderUsesMonotonicNativeDurationsAndCanReset() throws {
        var ticks: [UInt64] = [1_000_000, 4_500_000, 10_000_000, 11_250_000]
        let diagnostics = StingPerformanceDiagnostics(nowNanoseconds: {
            ticks.removeFirst()
        })

        let value = diagnostics.measure("bridge.replace-text") { 42 }
        XCTAssertEqual(value, 42)
        diagnostics.measure("bridge.replace-text") {}

        let snapshot = diagnostics.snapshot()
        XCTAssertEqual(
            snapshot.samples(for: "bridge.replace-text"),
            [3.5, 1.25]
        )

        diagnostics.reset()
        XCTAssertTrue(diagnostics.snapshot().metrics.isEmpty)
    }

    func testRuntimeMeasuresBundleBridgeModuleAndNativeEventRoundTrip() throws {
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let module = RecordingModule()
        let runtime = try StingJavaScriptRuntime(
            rootView: rootView,
            modules: [module],
            collectPerformanceDiagnostics: true
        )

        try runtime.evaluate(
            bundle: """
            __stingNativeBridge.createElement(1, "button");
            __stingNativeBridge.createTextNode(2, "Tap");
            __stingNativeBridge.insertNode(1, 2, -1);
            __stingNativeBridge.insertNode(0, 1, -1);
            __stingNativeBridge.setEventEnabled(1, "press", true);
            globalThis.__stingDispatchEvent = function(nodeId, event, payloadJSON) {
              __stingNativeBridge.replaceText(2, "Pressed");
              __stingNativeBridge.callModuleSync("Benchmark", "ping", "[]");
            };
            """
        )

        guard let diagnostics = runtime.performanceDiagnostics else {
            XCTFail("Opt-in diagnostics should be available")
            return
        }

        let mountSnapshot = diagnostics.snapshot()
        XCTAssertEqual(mountSnapshot.samples(for: "runtime.bundle-evaluate").count, 1)
        XCTAssertEqual(mountSnapshot.samples(for: "bridge.create-element").count, 1)
        XCTAssertEqual(mountSnapshot.samples(for: "bridge.create-text-node").count, 1)
        XCTAssertEqual(mountSnapshot.samples(for: "bridge.insert-node").count, 2)
        XCTAssertEqual(mountSnapshot.samples(for: "bridge.set-event-enabled").count, 1)

        guard let button = firstSubview(of: StingButton.self, in: rootView) else {
            XCTFail("Benchmark fixture should mount a native StingButton")
            return
        }

        XCTAssertEqual(button.title(for: .normal), "Tap")
        diagnostics.reset()
        button.onPress?(button.nodeId)

        XCTAssertEqual(button.title(for: .normal), "Pressed")
        XCTAssertEqual(module.calls, 1)

        let roundTrip = diagnostics.snapshot()
        XCTAssertEqual(roundTrip.samples(for: "event.press-round-trip").count, 1)
        XCTAssertEqual(roundTrip.samples(for: "bridge.replace-text").count, 1)
        XCTAssertEqual(roundTrip.samples(for: "bridge.call-module-sync").count, 1)
        XCTAssertTrue(roundTrip.samples(for: "event.press-round-trip").allSatisfy { $0 >= 0 })
        XCTAssertTrue(roundTrip.samples(for: "bridge.replace-text").allSatisfy { $0 >= 0 })
        XCTAssertTrue(roundTrip.samples(for: "bridge.call-module-sync").allSatisfy { $0 >= 0 })
    }

    func testDiagnosticsRemainDisabledByDefault() throws {
        let runtime = try StingJavaScriptRuntime(rootView: UIView())
        XCTAssertNil(runtime.performanceDiagnostics)
    }

    private func firstSubview<T: UIView>(of type: T.Type, in view: UIView) -> T? {
        if let typed = view as? T {
            return typed
        }
        for child in view.subviews {
            if let match = firstSubview(of: type, in: child) {
                return match
            }
        }
        return nil
    }
}
