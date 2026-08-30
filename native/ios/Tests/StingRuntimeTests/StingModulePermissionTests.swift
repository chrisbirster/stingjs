import XCTest
@testable import StingRuntime

final class StingModulePermissionTests: XCTestCase {
    private final class PermissionModule: StingNativeModule {
        let name = "PermissionModule"
        let version = "0.1.0"
        var requested: [String] = []

        func callSync(method: String, arguments: [Any]) throws -> Any? { nil }

        func permissionStatus(for permission: String) throws -> StingPermissionStatus {
            guard permission == "camera" else {
                throw StingNativeModuleError(
                    code: "E_PERMISSION_NOT_FOUND",
                    message: "unsupported"
                )
            }
            return .limited
        }

        func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
            requested.append(permission)
            guard permission == "camera" else {
                completion(.failure(StingNativeModuleError(
                    code: "E_PERMISSION_NOT_FOUND",
                    message: "unsupported"
                )))
                return
            }
            completion(.success(.granted))
        }
    }

    private final class DefaultModule: StingNativeModule {
        let name = "DefaultModule"
        let version = "0.1.0"
        func callSync(method: String, arguments: [Any]) throws -> Any? { nil }
    }

    func testPermissionStatusAndRequestUseReservedRegistryOperations() throws {
        let module = PermissionModule()
        let registry = try StingModuleRegistry(modules: [module])

        let status = try registry.callSync(
            module: module.name,
            method: "__sting_permission_status",
            arguments: ["camera"]
        ) as? String
        XCTAssertEqual(status, "limited")

        let requested = expectation(description: "permission request")
        registry.callAsync(
            module: module.name,
            method: "__sting_permission_request",
            arguments: ["camera"]
        ) { result in
            switch result {
            case .success(let value):
                XCTAssertEqual(value as? String, "granted")
            case .failure(let error):
                XCTFail("Unexpected permission failure: \(error)")
            }
            requested.fulfill()
        }
        wait(for: [requested], timeout: 1)
        XCTAssertEqual(module.requested, ["camera"])
    }

    func testDefaultPermissionHooksReturnStableErrors() throws {
        let registry = try StingModuleRegistry(modules: [DefaultModule()])

        XCTAssertThrowsError(try registry.callSync(
            module: "DefaultModule",
            method: "__sting_permission_status",
            arguments: ["camera"]
        )) { error in
            XCTAssertEqual((error as? StingNativeModuleError)?.code, "E_PERMISSION_NOT_FOUND")
        }

        let requested = expectation(description: "permission request failure")
        registry.callAsync(
            module: "DefaultModule",
            method: "__sting_permission_request",
            arguments: ["camera"]
        ) { result in
            if case .failure(let error) = result {
                XCTAssertEqual((error as? StingNativeModuleError)?.code, "E_PERMISSION_NOT_FOUND")
            } else {
                XCTFail("Expected permission request to fail")
            }
            requested.fulfill()
        }
        wait(for: [requested], timeout: 1)
    }

    func testInvalidPermissionNameIsRejectedBeforeModuleInvocation() throws {
        let module = PermissionModule()
        let registry = try StingModuleRegistry(modules: [module])

        XCTAssertThrowsError(try registry.callSync(
            module: module.name,
            method: "__sting_permission_status",
            arguments: ["   "]
        )) { error in
            XCTAssertEqual((error as? StingNativeModuleError)?.code, "E_INVALID_PERMISSION")
        }
        XCTAssertTrue(module.requested.isEmpty)
    }
}
