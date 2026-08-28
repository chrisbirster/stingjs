import XCTest
import UIKit
@testable import StingRuntime

final class StingNativeViewIntegrationTests: XCTestCase {
    private final class PreviewView: StingNativeView {
        let view = UIView(frame: .zero)
        private(set) var attachedCount = 0
        private(set) var detachedCount = 0
        private(set) var disposedCount = 0
        private(set) var properties: [String: Any] = [:]
        private var emitters: [String: StingNativeViewEventEmitter] = [:]
        private var disposed = false

        func setProperty(name: String, value: Any) throws {
            properties[name] = value
        }

        func setEventEnabled(
            event: String,
            enabled: Bool,
            emit: @escaping StingNativeViewEventEmitter
        ) throws {
            if enabled {
                emitters[event] = emit
            } else {
                emitters.removeValue(forKey: event)
            }
        }

        func didAttach() {
            attachedCount += 1
        }

        func didDetach() {
            detachedCount += 1
        }

        func dispose() {
            guard !disposed else { return }
            disposed = true
            disposedCount += 1
            emitters.removeAll()
        }

        func emit(_ event: String, payload: Any?) {
            emitters[event]?(payload)
        }
    }

    private final class ViewModule: StingNativeModule {
        let name = "ViewTest"
        let version = "0.1.0"
        private(set) var created: [PreviewView] = []

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "ViewTest exposes only native views"
            )
        }

        func createView(type: String) throws -> any StingNativeView {
            guard type == "Preview" else {
                throw StingNativeModuleError(
                    code: "E_VIEW_TYPE_NOT_FOUND",
                    message: "Unknown native view type \(type)"
                )
            }

            let preview = PreviewView()
            created.append(preview)
            return preview
        }
    }

    func testJavaScriptCoreRoutesModuleViewPropertiesEventsAndLifecycle() throws {
        XCTAssertTrue(Thread.isMainThread)

        let module = ViewModule()
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView, modules: [module])

        try runtime.evaluate(bundle: #"""
        globalThis.__stingViewEventCount = 0;
        globalThis.__stingViewLastPayload = null;
        globalThis.__stingDispatchEvent = function(nodeId, event, payloadJSON) {
          if (nodeId === 2 && event === "ready") {
            globalThis.__stingViewEventCount += 1;
            globalThis.__stingViewLastPayload = JSON.parse(payloadJSON);
          }
        };

        globalThis.__stingNativeBridge.createElement(1, "view");
        globalThis.__stingNativeBridge.createElement(
          2,
          "__sting_module_view__:ViewTest:Preview"
        );
        globalThis.__stingNativeBridge.setProperty(2, "mode", JSON.stringify("portrait"));
        globalThis.__stingNativeBridge.setEventEnabled(2, "ready", true);
        globalThis.__stingNativeBridge.insertNode(0, 1, -1);
        globalThis.__stingNativeBridge.insertNode(1, 2, -1);
        """#)

        let preview = try XCTUnwrap(module.created.first)
        XCTAssertEqual(preview.properties["mode"] as? String, "portrait")
        XCTAssertEqual(preview.attachedCount, 1)
        XCTAssertEqual(preview.detachedCount, 0)
        XCTAssertNotNil(preview.view.superview)

        preview.emit("ready", payload: ["value": 1])
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingViewEventCount")?.toInt32(),
            1
        )

        // Detaching an ancestor must make every nested module view inactive,
        // even though the preview still has its immediate native superview.
        try runtime.evaluate(bundle: "globalThis.__stingNativeBridge.removeNode(0, 1);")
        XCTAssertEqual(preview.detachedCount, 1)
        XCTAssertTrue(rootView.subviews.isEmpty)
        XCTAssertNotNil(preview.view.superview)

        preview.emit("ready", payload: ["value": 2])
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingViewEventCount")?.toInt32(),
            1
        )

        try runtime.evaluate(bundle: "globalThis.__stingNativeBridge.insertNode(0, 1, -1);")
        XCTAssertEqual(preview.attachedCount, 2)
        preview.emit("ready", payload: ["value": 3])
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingViewEventCount")?.toInt32(),
            2
        )

        // Direct keyed detach/reinsert remains valid and does not dispose the
        // native resource.
        try runtime.evaluate(bundle: "globalThis.__stingNativeBridge.removeNode(1, 2);")
        XCTAssertEqual(preview.detachedCount, 2)
        XCTAssertNil(preview.view.superview)
        preview.emit("ready", payload: ["value": 4])
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingViewEventCount")?.toInt32(),
            2
        )

        try runtime.evaluate(bundle: "globalThis.__stingNativeBridge.insertNode(1, 2, -1);")
        XCTAssertEqual(preview.attachedCount, 3)
        preview.emit("ready", payload: ["value": 5])
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingViewEventCount")?.toInt32(),
            3
        )
        XCTAssertEqual(
            runtime.context
                .objectForKeyedSubscript("__stingViewLastPayload")?
                .objectForKeyedSubscript("value")?
                .toInt32(),
            5
        )

        runtime.dispose()
        XCTAssertEqual(preview.detachedCount, 3)
        XCTAssertEqual(preview.disposedCount, 1)
        XCTAssertNil(preview.view.superview)

        runtime.dispose()
        XCTAssertEqual(preview.disposedCount, 1)
    }
}
