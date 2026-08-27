import XCTest
import UIKit
@testable import StingRuntime

final class StingAsyncModuleIntegrationTests: XCTestCase {
    private final class AsyncTestModule: StingNativeModule {
        let name = "AsyncTest"
        let version = "0.1.0"
        let completionQueued: XCTestExpectation
        private(set) var completedOffMainThread = false

        init(completionQueued: XCTestExpectation) {
            self.completionQueued = completionQueued
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            throw StingNativeModuleError(
                code: "E_SYNC_UNSUPPORTED",
                message: "AsyncTest is asynchronous only"
            )
        }

        func callAsync(
            method: String,
            arguments: [Any],
            completion: @escaping StingNativeModuleCompletion
        ) {
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                completedOffMainThread = !Thread.isMainThread
                completion(.success(["text": "native-async"]))
                completion(.success(["text": "duplicate-should-be-ignored"]))

                // The bridge enqueues JavaScript delivery onto the main queue
                // before this marker is enqueued from the same worker thread.
                DispatchQueue.main.async {
                    self.completionQueued.fulfill()
                }
            }
        }
    }

    func testBackgroundAsyncCompletionReturnsToJavaScriptCoreExactlyOnce() throws {
        XCTAssertTrue(Thread.isMainThread)

        let completionQueued = expectation(description: "async completion returned to main queue")
        let module = AsyncTestModule(completionQueued: completionQueued)
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(
            rootView: rootView,
            modules: [module],
            collectPerformanceDiagnostics: true
        )

        try runtime.evaluate(bundle: """
        globalThis.__stingAsyncResult = "pending";
        globalThis.__stingAsyncCompletionCount = 0;
        globalThis.__stingResolveModuleCall = function(requestId, responseJSON) {
          const response = JSON.parse(responseJSON);
          globalThis.__stingAsyncCompletionCount += 1;
          globalThis.__stingAsyncResult = response.ok ? response.value.text : response.error.code;
          return true;
        };
        globalThis.__stingNativeBridge.callModuleAsync("AsyncTest", "load", "[]", 41);
        """)

        wait(for: [completionQueued], timeout: 2.0)

        XCTAssertTrue(module.completedOffMainThread)
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingAsyncResult")?.toString(),
            "native-async"
        )
        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingAsyncCompletionCount")?.toInt32(),
            1
        )

        let diagnostics = runtime.performanceDiagnostics?.snapshot()
        XCTAssertEqual(diagnostics?.samples(for: "bridge.call-module-async-dispatch").count, 1)
        XCTAssertEqual(diagnostics?.samples(for: "bridge.call-module-async-completion").count, 1)

        runtime.dispose()
    }
}
