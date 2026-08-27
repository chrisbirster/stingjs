import XCTest
import UIKit
@testable import StingRuntime

final class StingNativeObjectIntegrationTests: XCTestCase {
    private final class CounterObject: StingNativeObject {
        private let onDispose: () -> Void
        private var value: Int
        private var disposed = false

        init(value: Int, onDispose: @escaping () -> Void) {
            self.value = value
            self.onDispose = onDispose
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            switch method {
            case "increment":
                value += (arguments.first as? NSNumber)?.intValue ?? 1
                return value
            case "value":
                return value
            default:
                throw StingNativeModuleError(
                    code: "E_OBJECT_METHOD_NOT_FOUND",
                    message: "Counter does not implement \(method)"
                )
            }
        }

        func callAsync(
            method: String,
            arguments: [Any],
            completion: @escaping StingNativeModuleCompletion
        ) {
            guard method == "incrementLater" else {
                completion(.failure(StingNativeModuleError(
                    code: "E_OBJECT_METHOD_NOT_FOUND",
                    message: "Counter does not implement asynchronous method \(method)"
                )))
                return
            }

            value += (arguments.first as? NSNumber)?.intValue ?? 1
            completion(.success(value))
        }

        func dispose() {
            guard !disposed else { return }
            disposed = true
            onDispose()
        }
    }

    private final class ObjectModule: StingNativeModule {
        let name: String
        let version = "0.1.0"
        private(set) var disposedCount = 0

        init(name: String = "ObjectTest") {
            self.name = name
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? {
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "ObjectTest exposes only native objects"
            )
        }

        func createObject(type: String, arguments: [Any]) throws -> any StingNativeObject {
            guard type == "Counter" else {
                throw StingNativeModuleError(
                    code: "E_OBJECT_TYPE_NOT_FOUND",
                    message: "Unknown object type \(type)"
                )
            }

            return CounterObject(
                value: (arguments.first as? NSNumber)?.intValue ?? 0,
                onDispose: { [weak self] in self?.disposedCount += 1 }
            )
        }
    }

    func testRegistryRejectsCrossModuleAndStaleObjectHandles() throws {
        let first = ObjectModule(name: "First")
        let second = ObjectModule(name: "Second")
        let registry = try StingModuleRegistry(modules: [first, second])

        let handle = try XCTUnwrap(
            registry.callSync(
                module: "First",
                method: "__sting_object_create",
                arguments: ["Counter", 4]
            ) as? Int
        )

        XCTAssertEqual(
            try registry.callSync(
                module: "First",
                method: "__sting_object_call_sync",
                arguments: [handle, "increment", 3]
            ) as? Int,
            7
        )

        XCTAssertThrowsError(
            try registry.callSync(
                module: "Second",
                method: "__sting_object_call_sync",
                arguments: [handle, "value"]
            )
        ) { error in
            XCTAssertEqual((error as? StingNativeModuleError)?.code, "E_OBJECT_MODULE_MISMATCH")
        }

        _ = try registry.callSync(
            module: "First",
            method: "__sting_object_dispose",
            arguments: [handle]
        )
        XCTAssertEqual(first.disposedCount, 1)

        XCTAssertThrowsError(
            try registry.callSync(
                module: "First",
                method: "__sting_object_call_sync",
                arguments: [handle, "value"]
            )
        ) { error in
            XCTAssertEqual((error as? StingNativeModuleError)?.code, "E_OBJECT_NOT_FOUND")
        }
    }

    func testJavaScriptCoreRuntimeDisposesEveryRemainingNativeObject() throws {
        XCTAssertTrue(Thread.isMainThread)

        let module = ObjectModule()
        let rootView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let runtime = try StingJavaScriptRuntime(rootView: rootView, modules: [module])

        try runtime.evaluate(bundle: """
        function nativeValue(responseJSON) {
          const response = JSON.parse(responseJSON);
          if (!response.ok) throw new Error(response.error.code + ":" + response.error.message);
          return response.value;
        }

        const first = nativeValue(globalThis.__stingNativeBridge.callModuleSync(
          "ObjectTest",
          "__sting_object_create",
          "[\"Counter\",2]"
        ));
        const second = nativeValue(globalThis.__stingNativeBridge.callModuleSync(
          "ObjectTest",
          "__sting_object_create",
          "[\"Counter\",10]"
        ));

        globalThis.__stingObjectValue = nativeValue(globalThis.__stingNativeBridge.callModuleSync(
          "ObjectTest",
          "__sting_object_call_sync",
          JSON.stringify([second, "increment", 5])
        ));

        nativeValue(globalThis.__stingNativeBridge.callModuleSync(
          "ObjectTest",
          "__sting_object_dispose",
          JSON.stringify([first])
        ));
        """)

        XCTAssertEqual(
            runtime.context.objectForKeyedSubscript("__stingObjectValue")?.toInt32(),
            15
        )
        XCTAssertEqual(module.disposedCount, 1)

        runtime.dispose()
        XCTAssertEqual(module.disposedCount, 2)

        // Runtime disposal is idempotent and must never dispose the same native
        // resource twice.
        runtime.dispose()
        XCTAssertEqual(module.disposedCount, 2)
    }
}
