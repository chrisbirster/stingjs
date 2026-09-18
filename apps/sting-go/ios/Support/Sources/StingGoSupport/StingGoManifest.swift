import Foundation

public enum StingGoProtocolError: LocalizedError, Equatable {
    case invalidManifest(String)
    case unsupportedSchema(Int)
    case unsupportedRuntime(required: String, supported: String)
    case unsupportedEngine(String)
    case unsupportedBundle(path: String, contentType: String)
    case unsupportedReload(path: String, transport: String, contentType: String)
    case unsupportedHealth(path: String, contentType: String)
    case unsupportedReport(path: String, method: String, contentType: String)
    case unsupportedCapabilities([String])
    case invalidEndpoint(String)

    public var errorDescription: String? {
        switch self {
        case .invalidManifest(let message):
            return "Invalid Sting Go manifest: \(message)"
        case .unsupportedSchema(let version):
            return "Unsupported Sting Go manifest schema \(version); expected 1"
        case .unsupportedRuntime(let required, let supported):
            return "Project requires Sting runtime \(required); this Sting Go supports \(supported)"
        case .unsupportedEngine(let engine):
            return "Project requires JavaScript engine \(engine); this Sting Go uses quickjs"
        case .unsupportedBundle(let path, let contentType):
            return "Unsupported Sting Go bundle endpoint \(path) (\(contentType))"
        case .unsupportedReload(let path, let transport, let contentType):
            return "Unsupported Sting Go reload endpoint \(path) (\(transport), \(contentType))"
        case .unsupportedHealth(let path, let contentType):
            return "Unsupported Sting Go health endpoint \(path) (\(contentType))"
        case .unsupportedReport(let path, let method, let contentType):
            return "Unsupported Sting Go report endpoint \(path) (\(method), \(contentType))"
        case .unsupportedCapabilities(let capabilities):
            return "This Sting Go build does not include required capabilities: \(capabilities.joined(separator: ", "))"
        case .invalidEndpoint(let path):
            return "Could not resolve Sting Go endpoint \(path) relative to the manifest URL"
        }
    }
}

public struct StingGoManifest: Decodable, Equatable, Sendable {
    public struct Project: Decodable, Equatable, Sendable {
        public let name: String
    }

    public struct Endpoint: Decodable, Equatable, Sendable {
        public let path: String
        public let contentType: String
    }

    public struct ReloadEndpoint: Decodable, Equatable, Sendable {
        public let path: String
        public let transport: String
        public let contentType: String
    }

    public struct ReportEndpoint: Decodable, Equatable, Sendable {
        public let path: String
        public let method: String
        public let contentType: String
    }

    public struct Development: Decodable, Equatable, Sendable {
        public let reload: ReloadEndpoint
        public let health: Endpoint
        public let report: ReportEndpoint?
    }

    public static let supportedSchemaVersion = 1
    public static let supportedRuntimeVersion = "0.1.0"
    public static let supportedEngine = "quickjs"

    public let schemaVersion: Int
    public let runtimeVersion: String
    public let engine: String
    public let project: Project
    public let bundle: Endpoint
    public let development: Development
    public let capabilities: Set<String>

    public static func decode(_ data: Data) throws -> StingGoManifest {
        do {
            return try JSONDecoder().decode(StingGoManifest.self, from: data)
        } catch {
            throw StingGoProtocolError.invalidManifest(error.localizedDescription)
        }
    }

    @discardableResult
    public func validate(
        clientRuntimeVersion: String = StingGoManifest.supportedRuntimeVersion,
        clientCapabilities: Set<String>
    ) throws -> StingGoManifest {
        guard schemaVersion == Self.supportedSchemaVersion else {
            throw StingGoProtocolError.unsupportedSchema(schemaVersion)
        }
        guard runtimeVersion == clientRuntimeVersion else {
            throw StingGoProtocolError.unsupportedRuntime(
                required: runtimeVersion,
                supported: clientRuntimeVersion
            )
        }
        guard engine == Self.supportedEngine else {
            throw StingGoProtocolError.unsupportedEngine(engine)
        }
        guard bundle.path == "/bundle", bundle.contentType == "application/javascript" else {
            throw StingGoProtocolError.unsupportedBundle(
                path: bundle.path,
                contentType: bundle.contentType
            )
        }
        let reload = development.reload
        guard reload.path == "/events",
              reload.transport == "sse",
              reload.contentType == "text/event-stream" else {
            throw StingGoProtocolError.unsupportedReload(
                path: reload.path,
                transport: reload.transport,
                contentType: reload.contentType
            )
        }
        let health = development.health
        guard health.path == "/health", health.contentType == "application/json" else {
            throw StingGoProtocolError.unsupportedHealth(
                path: health.path,
                contentType: health.contentType
            )
        }
        if let report = development.report {
            guard report.path == "/report",
                  report.method == "POST",
                  report.contentType == "application/json" else {
                throw StingGoProtocolError.unsupportedReport(
                    path: report.path,
                    method: report.method,
                    contentType: report.contentType
                )
            }
        }

        let unsupported = capabilities.subtracting(clientCapabilities).sorted()
        guard unsupported.isEmpty else {
            throw StingGoProtocolError.unsupportedCapabilities(unsupported)
        }
        return self
    }

    public func endpointURL(path: String, relativeTo manifestURL: URL) throws -> URL {
        guard let url = URL(string: path, relativeTo: manifestURL)?.absoluteURL,
              url.scheme == "http" || url.scheme == "https" else {
            throw StingGoProtocolError.invalidEndpoint(path)
        }
        return url
    }
}

public struct StingGoHealth: Decodable, Equatable, Sendable {
    public let ok: Bool
    public let watching: Bool
    public let reloadVersion: Int
}
