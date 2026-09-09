import XCTest
import UIKit
@testable import StingRuntime

final class StingModuleLifecycleTests: XCTestCase {
    private final class LifecycleModule: StingNativeModule {
        let name: String
        let version = "0.1.0"
        let sharedEvents: NSMutableArray
        private(set) var events: [StingApplicationLifecycleEvent] = []

        init(name: String, sharedEvents: NSMutableArray = NSMutableArray()) {
            self.name = name
            self.sharedEvents = sharedEvents
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            throw StingNativeModuleError(
                code: "E_SYNC_UNSUPPORTED",
                message: "LifecycleModule exposes lifecycle only"
            )
        }

        func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
            events.append(event)
            sharedEvents.add("\(name):\(event.rawValue)")
        }

        func handleBackgroundEvent(
            name: String,
            payload: Any?,
            completion: @escaping StingNativeModuleCompletion
        ) {
            guard name == "refresh" else {
                completion(.failure(StingNativeModuleError(
                    code: "E_BACKGROUND_EVENT_NOT_FOUND",
                    message: "unsupported"
                )))
                return
            }
            completion(.success(["event": name, "payload": payload as Any]))
        }
    }

    private final class DefaultLifecycleModule: StingNativeModule {
        let name = "DefaultLifecycle"
        let version = "0.1.0"

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            nil
        }
    }

    func testLifecycleDispatchPreservesRegistrationOrderAndDisposalIsOneShot() throws {
        let shared = NSMutableArray()
        let first = LifecycleModule(name: "First", sharedEvents: shared)
        let second = LifecycleModule(name: "Second", sharedEvents: shared)
        let registry = try StingModuleRegistry(modules: [first, second])

        registry.dispatchLifecycle(.foreground)
        registry.dispatchLifecycle(.active)
        registry.dispose()
        registry.dispose()
        registry.dispatchLifecycle(.background)

        XCTAssertEqual(
            shared as? [String],
            [
                "First:foreground",
                "Second:foreground",
                "First:active",
                "Second:active",
                "First:runtimeDisposing",
                "Second:runtimeDisposing",
            ]
        )
        XCTAssertEqual(first.events.last, .runtimeDisposing)
        XCTAssertEqual(second.events.last, .runtimeDisposing)
    }

    func testUIKitNotificationsFeedSharedLifecycleContract() throws {
        let module = LifecycleModule(name: "Observer")
        let registry = try StingModuleRegistry(modules: [module])

        NotificationCenter.default.post(
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        NotificationCenter.default.post(
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.post(
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.post(
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )

        XCTAssertEqual(module.events, [.foreground, .active, .inactive, .background])
        registry.dispose()
    }

    func testBackgroundDeliveryAndStableErrors() throws {
        let lifecycle = LifecycleModule(name: "Lifecycle")
        let fallback = DefaultLifecycleModule()
        let registry = try StingModuleRegistry(modules: [lifecycle, fallback])

        var success: Any?
        registry.deliverBackgroundEvent(
            module: "Lifecycle",
            event: "refresh",
            payload: "payload"
        ) { result in
            if case let .success(value) = result { success = value }
        }
        let response = success as? [String: Any]
        XCTAssertEqual(response?["event"] as? String, "refresh")
        XCTAssertEqual(response?["payload"] as? String, "payload")

        var unsupported: StingNativeModuleError?
        registry.deliverBackgroundEvent(
            module: "DefaultLifecycle",
            event: "refresh",
            payload: nil
        ) { result in
            if case let .failure(error) = result { unsupported = error as? StingNativeModuleError }
        }
        XCTAssertEqual(unsupported?.code, "E_BACKGROUND_EVENT_NOT_FOUND")

        registry.dispose()
        var disposed: StingNativeModuleError?
        registry.deliverBackgroundEvent(
            module: "Lifecycle",
            event: "refresh",
            payload: nil
        ) { result in
            if case let .failure(error) = result { disposed = error as? StingNativeModuleError }
        }
        XCTAssertEqual(disposed?.code, "E_RUNTIME_DISPOSED")
    }
}
