import XCTest
@testable import StingGoSupport

final class StingGoSupportTests: XCTestCase {
    private let compatibleManifest = """
    {
      "schemaVersion": 1,
      "runtimeVersion": "0.1.0",
      "engine": "quickjs",
      "project": {"name": "demo"},
      "bundle": {"path": "/bundle", "contentType": "application/javascript"},
      "development": {
        "reload": {"path": "/events", "transport": "sse", "contentType": "text/event-stream"},
        "health": {"path": "/health", "contentType": "application/json"}
      },
      "capabilities": ["haptics", "clipboard"]
    }
    """

    func testCompatibleManifestPublishesDevelopmentEndpoints() throws {
        let manifest = try StingGoManifest.decode(Data(compatibleManifest.utf8))
        try manifest.validate(clientCapabilities: ["haptics", "clipboard"])

        XCTAssertEqual(manifest.project.name, "demo")
        XCTAssertEqual(manifest.bundle.path, "/bundle")
        XCTAssertEqual(manifest.development.reload.path, "/events")
        XCTAssertEqual(manifest.development.health.path, "/health")
        XCTAssertEqual(
            try manifest.endpointURL(
                path: manifest.bundle.path,
                relativeTo: XCTUnwrap(URL(string: "http://192.168.1.10:8081/manifest"))
            ).absoluteString,
            "http://192.168.1.10:8081/bundle"
        )
    }

    func testManifestRejectsWrongProductionEngine() throws {
        let source = compatibleManifest.replacingOccurrences(of: "\"quickjs\"", with: "\"quickjs-ng\"")
        let manifest = try StingGoManifest.decode(Data(source.utf8))

        XCTAssertThrowsError(try manifest.validate(clientCapabilities: ["haptics", "clipboard"])) { error in
            XCTAssertEqual(error as? StingGoProtocolError, .unsupportedEngine("quickjs-ng"))
        }
    }

    func testManifestRejectsMissingCapability() throws {
        let manifest = try StingGoManifest.decode(Data(compatibleManifest.utf8))

        XCTAssertThrowsError(try manifest.validate(clientCapabilities: ["haptics"])) { error in
            XCTAssertEqual(
                error as? StingGoProtocolError,
                .unsupportedCapabilities(["clipboard"])
            )
        }
    }

    func testSSEParserDeliversReadyAndReloadVersions() throws {
        var parser = StingGoSSEParser()
        XCTAssertNil(try parser.consume(line: ": keepalive"))
        XCTAssertNil(try parser.consume(line: "event: ready"))
        XCTAssertNil(try parser.consume(line: "data: {\"version\":2}"))
        XCTAssertEqual(
            try parser.consume(line: ""),
            StingGoReloadEvent(name: .ready, version: 2)
        )

        XCTAssertNil(try parser.consume(line: "event: reload"))
        XCTAssertNil(try parser.consume(line: "data: {\"version\":3}"))
        XCTAssertEqual(
            try parser.consume(line: ""),
            StingGoReloadEvent(name: .reload, version: 3)
        )
    }

    func testSSEParserRejectsNegativeVersion() throws {
        var parser = StingGoSSEParser()
        XCTAssertNil(try parser.consume(line: "event: reload"))
        XCTAssertNil(try parser.consume(line: "data: {\"version\":-1}"))
        XCTAssertThrowsError(try parser.consume(line: ""))
    }
}
