import Foundation

public enum StingGoReportKind: String, Encodable, Sendable {
    case connection
    case compatibility
    case bundle
    case runtime
    case reload
}

public struct StingGoClientReport: Encodable, Equatable, Sendable {
    public let kind: StingGoReportKind
    public let platform: String
    public let message: String
    public let detail: String?

    public init(kind: StingGoReportKind, message: String, detail: String? = nil) {
        self.kind = kind
        self.platform = "ios"
        self.message = message
        self.detail = detail
    }
}

public enum StingGoReportClient {
    public static func send(
        _ report: StingGoClientReport,
        to endpointURL: URL,
        session: URLSession = .shared
    ) async throws {
        var request = URLRequest(url: endpointURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("StingGo/0.1.0", forHTTPHeaderField: "User-Agent")
        request.httpBody = try JSONEncoder().encode(report)

        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode) else {
            throw StingGoProtocolError.invalidManifest("Development report endpoint rejected the report")
        }
    }
}
