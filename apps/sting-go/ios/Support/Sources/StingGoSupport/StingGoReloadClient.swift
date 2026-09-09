import Foundation

public enum StingGoReloadEventName: String, Equatable, Sendable {
    case ready
    case reload
}

public struct StingGoReloadEvent: Equatable, Sendable {
    public let name: StingGoReloadEventName
    public let version: Int

    public init(name: StingGoReloadEventName, version: Int) {
        self.name = name
        self.version = version
    }
}

public struct StingGoSSEParser: Sendable {
    private var eventName: String?
    private var dataLines: [String] = []

    public init() {}

    public mutating func consume(line: String) throws -> StingGoReloadEvent? {
        if line.isEmpty {
            defer { reset() }
            guard let rawName = eventName,
                  let name = StingGoReloadEventName(rawValue: rawName),
                  !dataLines.isEmpty else {
                return nil
            }

            let data = Data(dataLines.joined(separator: "\n").utf8)
            let payload: ReloadPayload
            do {
                payload = try JSONDecoder().decode(ReloadPayload.self, from: data)
            } catch {
                throw StingGoReloadClientError.invalidEvent(error.localizedDescription)
            }
            guard payload.version >= 0 else {
                throw StingGoReloadClientError.invalidEvent("reload version must be non-negative")
            }
            return StingGoReloadEvent(name: name, version: payload.version)
        }

        if line.hasPrefix(":") {
            return nil
        }

        let pieces = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        let field = String(pieces[0])
        var value = pieces.count == 2 ? String(pieces[1]) : ""
        if value.hasPrefix(" ") {
            value.removeFirst()
        }

        switch field {
        case "event":
            eventName = value
        case "data":
            dataLines.append(value)
        default:
            break
        }
        return nil
    }

    private mutating func reset() {
        eventName = nil
        dataLines.removeAll(keepingCapacity: true)
    }

    private struct ReloadPayload: Decodable {
        let version: Int
    }
}

public enum StingGoReloadStatus: Equatable, Sendable {
    case connecting
    case live
    case reconnecting(String)
}

public enum StingGoReloadClientError: LocalizedError, Equatable {
    case http(Int)
    case contentType(String?)
    case streamClosed
    case invalidEvent(String)

    public var errorDescription: String? {
        switch self {
        case .http(let status):
            return "Reload server returned HTTP \(status)"
        case .contentType(let contentType):
            return "Expected text/event-stream, got \(contentType ?? "no content type")"
        case .streamClosed:
            return "Reload stream closed"
        case .invalidEvent(let message):
            return "Invalid Sting Go reload event: \(message)"
        }
    }
}

public final class StingGoReloadClient {
    private let endpointURL: URL
    private let session: URLSession
    private let onEvent: (StingGoReloadEvent) -> Void
    private let onStatus: (StingGoReloadStatus) -> Void
    private let initialReconnectDelayNanoseconds: UInt64
    private let maxReconnectDelayNanoseconds: UInt64
    private var task: Task<Void, Never>?

    public init(
        endpointURL: URL,
        session: URLSession = .shared,
        initialReconnectDelayMilliseconds: UInt64 = 250,
        maxReconnectDelayMilliseconds: UInt64 = 2_000,
        onEvent: @escaping (StingGoReloadEvent) -> Void,
        onStatus: @escaping (StingGoReloadStatus) -> Void = { _ in }
    ) {
        self.endpointURL = endpointURL
        self.session = session
        self.onEvent = onEvent
        self.onStatus = onStatus
        self.initialReconnectDelayNanoseconds = initialReconnectDelayMilliseconds * 1_000_000
        self.maxReconnectDelayNanoseconds = maxReconnectDelayMilliseconds * 1_000_000
    }

    deinit {
        close()
    }

    public func start() {
        guard task == nil else { return }
        onStatus(.connecting)
        task = Task { [weak self] in
            guard let self else { return }
            await self.runLoop()
        }
    }

    public func close() {
        task?.cancel()
        task = nil
    }

    private func runLoop() async {
        var reconnectDelay = initialReconnectDelayNanoseconds

        while !Task.isCancelled {
            do {
                let connected = try await consumeOnce()
                if Task.isCancelled { return }
                if connected {
                    reconnectDelay = initialReconnectDelayNanoseconds
                }
                throw StingGoReloadClientError.streamClosed
            } catch is CancellationError {
                return
            } catch {
                if Task.isCancelled { return }
                onStatus(.reconnecting(error.localizedDescription))
                do {
                    try await Task.sleep(nanoseconds: reconnectDelay)
                } catch {
                    return
                }
                reconnectDelay = min(reconnectDelay * 2, maxReconnectDelayNanoseconds)
            }
        }
    }

    private func consumeOnce() async throws -> Bool {
        let (bytes, response) = try await session.bytes(from: endpointURL)
        guard let http = response as? HTTPURLResponse else {
            throw StingGoReloadClientError.http(0)
        }
        guard (200...299).contains(http.statusCode) else {
            throw StingGoReloadClientError.http(http.statusCode)
        }
        guard response.mimeType?.lowercased() == "text/event-stream" else {
            throw StingGoReloadClientError.contentType(response.mimeType)
        }

        onStatus(.live)
        var parser = StingGoSSEParser()
        for try await line in bytes.lines {
            try Task.checkCancellation()
            if let event = try parser.consume(line: line) {
                onEvent(event)
            }
        }
        return true
    }
}
