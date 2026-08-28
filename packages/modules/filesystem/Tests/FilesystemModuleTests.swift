import Foundation
import StingRuntime
import XCTest
@testable import StingFilesystem

final class FilesystemModuleTests: XCTestCase {
    private struct Completion {
        let result: Result<Any?, Error>
        let completedOnMainThread: Bool
    }

    private func call(
        _ module: FilesystemModule,
        method: String,
        arguments: [Any],
        timeout: TimeInterval = 2
    ) -> Completion {
        let completed = expectation(description: "Filesystem.\(method)")
        var captured: Completion?

        module.callAsync(method: method, arguments: arguments) { result in
            captured = Completion(
                result: result,
                completedOnMainThread: Thread.isMainThread
            )
            completed.fulfill()
        }

        wait(for: [completed], timeout: timeout)
        return try! XCTUnwrap(captured)
    }

    func testAsyncWriteReadInfoDeleteRoundTrip() throws {
        let module = FilesystemModule()
        let directory = "sting-filesystem-\(UUID().uuidString)"
        let file = "\(directory)/sample.txt"

        defer {
            _ = call(module, method: "delete", arguments: [directory, "cache"])
        }

        let created = call(
            module,
            method: "makeDirectory",
            arguments: [directory, "cache"]
        )
        _ = try created.result.get()
        XCTAssertFalse(created.completedOnMainThread)

        let written = call(
            module,
            method: "writeText",
            arguments: [file, "sting-filesystem", "cache"]
        )
        _ = try written.result.get()
        XCTAssertFalse(written.completedOnMainThread)

        let read = call(
            module,
            method: "readText",
            arguments: [file, "cache"]
        )
        XCTAssertEqual(try read.result.get() as? String, "sting-filesystem")
        XCTAssertFalse(read.completedOnMainThread)

        let infoResult = call(
            module,
            method: "getInfo",
            arguments: [file, "cache"]
        )
        let info = try XCTUnwrap(try infoResult.result.get() as? [String: Any])
        XCTAssertEqual(info["exists"] as? Bool, true)
        XCTAssertEqual(info["type"] as? String, "file")
        XCTAssertGreaterThan((info["size"] as? NSNumber)?.doubleValue ?? 0, 0)
        XCTAssertNotNil(info["modifiedAt"])
        XCTAssertFalse(infoResult.completedOnMainThread)

        let deleted = call(
            module,
            method: "delete",
            arguments: [file, "cache"]
        )
        _ = try deleted.result.get()
        XCTAssertFalse(deleted.completedOnMainThread)

        let missingResult = call(
            module,
            method: "getInfo",
            arguments: [file, "cache"]
        )
        let missing = try XCTUnwrap(try missingResult.result.get() as? [String: Any])
        XCTAssertEqual(missing["exists"] as? Bool, false)
        XCTAssertTrue(missing["type"] is NSNull)
    }

    func testRejectsTraversalOutsideSelectedRoot() throws {
        let completion = call(
            FilesystemModule(),
            method: "readText",
            arguments: ["../escape.txt", "cache"]
        )

        switch completion.result {
        case .success:
            XCTFail("Filesystem traversal unexpectedly succeeded")
        case .failure(let error):
            let nativeError = try XCTUnwrap(error as? StingNativeModuleError)
            XCTAssertEqual(nativeError.code, "E_INVALID_PATH")
        }
    }

    func testWriteRequiresExistingParentDirectory() throws {
        let module = FilesystemModule()
        let file = "missing-\(UUID().uuidString)/sample.txt"
        let completion = call(
            module,
            method: "writeText",
            arguments: [file, "contents", "cache"]
        )

        switch completion.result {
        case .success:
            XCTFail("Filesystem.writeText unexpectedly created its parent directory")
        case .failure(let error):
            let nativeError = try XCTUnwrap(error as? StingNativeModuleError)
            XCTAssertEqual(nativeError.code, "E_NOT_FOUND")
        }
    }
}
