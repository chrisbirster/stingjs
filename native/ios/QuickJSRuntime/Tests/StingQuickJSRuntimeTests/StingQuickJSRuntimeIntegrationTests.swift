import XCTest
import UIKit
@testable import StingRuntime
@testable import StingQuickJSRuntime

final class StingQuickJSRuntimeIntegrationTests: XCTestCase {
    private final class RecordingHapticsModule: StingNativeModule {
        let name = "Haptics"
        let version = "0.1.0"
        private(set) var calls: [(method: String, arguments: [Any])] = []

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            calls.append((method, arguments))
            return nil
        }
    }

    func testHelloWorldRoundTripsNativePressThroughOfficialQuickJSSolidAndHaptics() throws {
        let bundleURL = try requireBundle(named: "sting-app")
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let haptics = RecordingHapticsModule()
        let runtime = try StingQuickJSRuntime(rootView: rootView, modules: [haptics])
        defer { runtime.dispose() }

        var runtimeErrors: [Error] = []
        runtime.runtimeErrorSink = { runtimeErrors.append($0) }

        try runtime.evaluate(bundle: bundle, sourceURL: bundleURL)

        guard let label = firstSubview(of: UILabel.self, in: rootView) else {
            XCTFail("Solid/Sting should mount a native UILabel through official QuickJS")
            return
        }
        guard let button = firstButton(titled: "Add", in: rootView) else {
            XCTFail("Solid/Sting should mount the native Add button through official QuickJS")
            return
        }

        XCTAssertEqual(label.text, "Count: 0")
        XCTAssertEqual(button.title(for: .normal), "Add")
        XCTAssertNotNil(button.onPress)

        button.onPress?(button.nodeId)

        XCTAssertEqual(
            label.text,
            "Count: 1",
            "native press -> official QuickJS -> Solid signal -> UIKit text must complete"
        )
        XCTAssertEqual(haptics.calls.count, 1)
        XCTAssertEqual(haptics.calls.first?.method, "impact")
        XCTAssertEqual(haptics.calls.first?.arguments.first as? String, "medium")
        XCTAssertTrue(runtimeErrors.isEmpty, "unexpected QuickJS runtime errors: \(runtimeErrors)")
    }

    func testDisposeIsIdempotentAndRejectsFurtherEvaluation() throws {
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingQuickJSRuntime(rootView: rootView)

        try runtime.close()
        XCTAssertNoThrow(try runtime.close())
        XCTAssertThrowsError(try runtime.evaluate(bundle: "globalThis.afterClose = true;"))
    }

    private func requireBundle(named name: String) throws -> URL {
        guard let url = Bundle.module.url(
            forResource: name,
            withExtension: "js",
            subdirectory: "Fixtures"
        ) else {
            throw XCTSkip("Missing generated QuickJS iOS fixture \(name).js")
        }
        return url
    }

    private func firstButton(titled title: String, in root: UIView) -> StingButton? {
        firstSubview(of: StingButton.self, in: root) {
            $0.title(for: .normal) == title
        }
    }

    private func firstSubview<T: UIView>(
        of type: T.Type,
        in root: UIView,
        where predicate: (T) -> Bool = { _ in true }
    ) -> T? {
        if let match = root as? T, predicate(match) {
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
