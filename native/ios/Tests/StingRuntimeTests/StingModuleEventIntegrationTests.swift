import XCTest
import UIKit
@testable import StingRuntime

final class StingModuleEventIntegrationTests: XCTestCase {
    private final class EventTestModule: StingNativeModule {
        let name = "EventTest"
        let version = "0.1.0"
        let deliveryQueued: XCTestExpectation
        private(set) var emittedOffMainThread = false
        private var retainedEmitter: StingNativeModuleEventEmitter?

        init(deliveryQueued: XCTestExpectation) {
            self.deliveryQueued = deliveryQueued
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            throw StingNativeModuleError(
                code: "E_SYNC_UNSUPPORTED",
                message: "EventTest exposes events only"
            )
        }

        func setEventEnabled(
            event: String,
            enabled: Bool,
            emit: @escaping StingNativeModuleEventEmitter
        ) throws {
            guard event == "change" else {
                throw StingNativeModuleError(
                    code: "E_EVENT_NOT_FOUND",
                    message: "EventTest does not implement event \(event)"
                )
            }

            if enabled {
                retainedEmitter = emit
                DispatchQueue.global(qos: .userInitiated).async { [self] in
                    emittedOffMainThread = !Thread.isMainThread
                    emit(["text": "ios-event"])

                    // The bridge queues JavaScriptCore delivery onto the main
                    // queue before this marker is queued by the same worker.
                    DispatchQueue.main.async {
                        self.deliveryQueued.fulfill()
                    }
                }
            } else {
                // Deliberately emit through the old callback during disable.
                // The bridge removed this observation first, so it is stale.
                retainedEmitter?(["text": "late-should-be-ignored"])
                retainedEmitter = nil
            }
        }
    }

    func testBackgroundModuleEventReturnsToJavaScriptCoreAndLateEventIsIgnored() throws {
        XCTAssertTrue(Thread.isMainThread)

        let deliveryQueued = expectation(description: "module event returned to main queue")
        let module = EventTestModule(deliveryQueued: deliveryQueued)
        let runtime = try StingJavaScriptRuntime(
            rootView: UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844)),
            modules: [module]
        )

        try runtime.evaluate(bundle: """
        globalThis.__stingModuleEventResult = "pending";
        globalThis.__stingModuleEventCount = 0;
        globalThis.__stingDispatchModuleEvent = function(module, event, payloadJSON) {
          const payload = JSON.parse(payloadJSON);
          globalThis.__stingModuleEventCount += 1;
          globalThis.__stingModuleEventResult = module + ":" + event + ":" + payload.text;
          return true;
        };

        const enabled = JSON.parse(
          globalThis.__stingNativeBridge.setModuleEventEnabled("EventTest", "change", true)
        );
        if (!enabled.ok) {
          throw new Error("unable to enable EventTest.change: " + enabled.error.code);
        }
        """)

        wait(for: [deliveryQueued], timeout: 2.0)

        XCTAssertTrue(module.emittedOffMainThread)
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingModuleEventResult")?.toString(),
            "EventTest:change:ios-event"
        )
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingModuleEventCount")?.toInt32(),
            1
        )

        try runtime.evaluate(bundle: """
        const disabled = JSON.parse(
          globalThis.__stingNativeBridge.setModuleEventEnabled("EventTest", "change", false)
        );
        if (!disabled.ok) {
          throw new Error("unable to disable EventTest.change: " + disabled.error.code);
        }
        if (globalThis.__stingModuleEventCount !== 1) {
          throw new Error("late module event escaped disable filtering");
        }
        """)

        runtime.dispose()
    }
}
