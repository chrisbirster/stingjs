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
        guard let button = firstSubview(of: UIButton.self, in: rootView) else {
            XCTFail("Solid/Sting should mount a native UIButton")
            return
        }

        XCTAssertEqual(label.text, "Count: 0")
        XCTAssertEqual(button.title(for: .normal), "Add")

        button.sendActions(for: .touchUpInside)

        XCTAssertEqual(
            label.text,
            "Count: 1",
            "A native press should update exactly the mounted native text through Solid reactivity"
        )
        XCTAssertEqual(haptics.calls.count, 1)
        XCTAssertEqual(haptics.calls.first?.method, "impact")
        XCTAssertEqual(haptics.calls.first?.arguments.first as? String, "medium")
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
