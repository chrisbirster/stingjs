import XCTest
@testable import StingRuntime

final class StingPermissionReliabilityTests: XCTestCase {
    private final class DeferredPermissionModule: StingNativeModule {
        let name: String
        let version = "0.1.0"
        var statuses: [String: StingPermissionStatus] = ["camera": .undetermined]
        private(set) var requested: [String] = []
        private(set) var completions: [StingPermissionCompletion] = []

        init(name: String = "PermissionModule") {
            self.name = name
        }

        func callSync(method: String, arguments: [Any]) throws -> Any? { nil }

        func permissionStatus(for permission: String) throws -> StingPermissionStatus {
            guard let status = statuses[permission] else {
                throw StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "unsupported")
            }
            return status
        }

        func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
            guard statuses[permission] != nil else {
                completion(.failure(StingNativeModuleError(
                    code: "E_PERMISSION_NOT_FOUND",
                    message: "unsupported"
                )))
                return
            }
            requested.append(permission)
            completions.append(completion)
        }

        func complete(_ index: Int, permission: String = "camera", status: StingPermissionStatus) {
            statuses[permission] = status
            completions[index](.success(status))
        }
    }

    private final class Consumer {
        var settled = 0
    }

    private func errorCode(_ result: Result<Any?, Error>?) -> String? {
        guard case .failure(let error)? = result else { return nil }
        return (error as? StingNativeModuleError)?.code
    }

    func testPermissionStatusAlwaysRefreshesFromModule() throws {
        let module = DeferredPermissionModule()
        let registry = try StingModuleRegistry(modules: [module])

        XCTAssertEqual(
            try registry.callSync(module: module.name, method: "__sting_permission_status", arguments: ["camera"]) as? String,
            "undetermined"
        )
        module.statuses["camera"] = .granted
        XCTAssertEqual(
            try registry.callSync(module: module.name, method: "__sting_permission_status", arguments: ["camera"]) as? String,
            "granted"
        )
        module.statuses["camera"] = .denied
        XCTAssertEqual(
            try registry.callSync(module: module.name, method: "__sting_permission_status", arguments: ["camera"]) as? String,
            "denied"
        )
    }

    func testDeniedPermissionCanBeRequestedAgain() throws {
        let module = DeferredPermissionModule()
        let registry = try StingModuleRegistry(modules: [module])
        var first: Result<Any?, Error>?
        var second: Result<Any?, Error>?

        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) {
            first = $0
        }
        XCTAssertEqual(module.requested, ["camera"])
        module.complete(0, status: .denied)
        if case .success(let value)? = first {
            XCTAssertEqual(value as? String, "denied")
        } else {
            XCTFail("Expected denied status")
        }

        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) {
            second = $0
        }
        XCTAssertEqual(module.requested, ["camera", "camera"])
        module.complete(1, status: .granted)
        if case .success(let value)? = second {
            XCTAssertEqual(value as? String, "granted")
        } else {
            XCTFail("Expected granted status")
        }
    }

    func testConcurrentSamePermissionUsesOneNativeTransactionAndSettlesOnce() throws {
        let module = DeferredPermissionModule()
        let registry = try StingModuleRegistry(modules: [module])
        var firstSettles = 0
        var secondSettles = 0
        var firstValue: String?
        var secondValue: String?

        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) { result in
            firstSettles += 1
            if case .success(let value) = result { firstValue = value as? String }
        }
        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) { result in
            secondSettles += 1
            if case .success(let value) = result { secondValue = value as? String }
        }

        XCTAssertEqual(module.requested, ["camera"])
        module.complete(0, status: .granted)
        module.complete(0, status: .denied)

        XCTAssertEqual(firstSettles, 1)
        XCTAssertEqual(secondSettles, 1)
        XCTAssertEqual(firstValue, "granted")
        XCTAssertEqual(secondValue, "granted")
    }

    func testConcurrentRequestsForDifferentModulesStayIndependent() throws {
        let firstModule = DeferredPermissionModule(name: "First")
        let secondModule = DeferredPermissionModule(name: "Second")
        let registry = try StingModuleRegistry(modules: [firstModule, secondModule])
        var firstValue: String?
        var secondValue: String?

        registry.callAsync(module: firstModule.name, method: "__sting_permission_request", arguments: ["camera"]) { result in
            if case .success(let value) = result { firstValue = value as? String }
        }
        registry.callAsync(module: secondModule.name, method: "__sting_permission_request", arguments: ["camera"]) { result in
            if case .success(let value) = result { secondValue = value as? String }
        }

        XCTAssertEqual(firstModule.requested.count, 1)
        XCTAssertEqual(secondModule.requested.count, 1)
        secondModule.complete(0, status: .denied)
        firstModule.complete(0, status: .granted)
        XCTAssertEqual(firstValue, "granted")
        XCTAssertEqual(secondValue, "denied")
    }

    func testDisposeDrainsPendingRequestsAndSuppressesLateCompletions() throws {
        let module = DeferredPermissionModule()
        let registry = try StingModuleRegistry(modules: [module])
        var result: Result<Any?, Error>?
        var settles = 0

        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) {
            settles += 1
            result = $0
        }
        XCTAssertEqual(module.requested.count, 1)

        registry.dispose()
        XCTAssertEqual(settles, 1)
        XCTAssertEqual(errorCode(result), "E_RUNTIME_DISPOSED")

        module.complete(0, status: .granted)
        XCTAssertEqual(settles, 1)

        var afterDispose: Result<Any?, Error>?
        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) {
            afterDispose = $0
        }
        XCTAssertEqual(errorCode(afterDispose), "E_RUNTIME_DISPOSED")
        XCTAssertEqual(module.requested.count, 1)
    }

    func testOldRuntimeCompletionCannotEnterNewRuntimeGeneration() throws {
        let firstModule = DeferredPermissionModule()
        let firstRegistry = try StingModuleRegistry(modules: [firstModule])
        var firstResult: Result<Any?, Error>?
        firstRegistry.callAsync(module: firstModule.name, method: "__sting_permission_request", arguments: ["camera"]) {
            firstResult = $0
        }
        firstRegistry.dispose()
        XCTAssertEqual(errorCode(firstResult), "E_RUNTIME_DISPOSED")

        let secondModule = DeferredPermissionModule()
        let secondRegistry = try StingModuleRegistry(modules: [secondModule])
        var secondSettles = 0
        var secondValue: String?
        secondRegistry.callAsync(module: secondModule.name, method: "__sting_permission_request", arguments: ["camera"]) { result in
            secondSettles += 1
            if case .success(let value) = result { secondValue = value as? String }
        }

        firstModule.complete(0, status: .granted)
        XCTAssertEqual(secondSettles, 0)
        secondModule.complete(0, status: .denied)
        XCTAssertEqual(secondSettles, 1)
        XCTAssertEqual(secondValue, "denied")
    }

    func testPermissionResultDoesNotRetainDisappearedConsumer() throws {
        let module = DeferredPermissionModule()
        let registry = try StingModuleRegistry(modules: [module])
        var consumer: Consumer? = Consumer()
        weak var weakConsumer = consumer

        registry.callAsync(module: module.name, method: "__sting_permission_request", arguments: ["camera"]) { [weak consumer] _ in
            consumer?.settled += 1
        }
        consumer = nil
        XCTAssertNil(weakConsumer)
        module.complete(0, status: .granted)
        XCTAssertNil(weakConsumer)
    }
}
