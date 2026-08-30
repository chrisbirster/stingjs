import Foundation
import Network
import StingRuntime

public final class NetworkModule: StingNativeModule {
    public let name = "Network"
    public let version = "0.1.0"

    private let queue = DispatchQueue(label: "run.stingjs.modules.network", qos: .utility)
    private let lock = NSLock()
    private var eventMonitor: NWPathMonitor?

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(
            code: "E_SYNC_UNSUPPORTED",
            message: "Network methods are asynchronous"
        )
    }

    public func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        guard method == "getState" else {
            completion(.failure(StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Network does not implement asynchronous method \(method)"
            )))
            return
        }

        let monitor = NWPathMonitor()
        let completionLock = NSLock()
        var completed = false
        monitor.pathUpdateHandler = { [weak self] path in
            completionLock.lock()
            guard !completed else {
                completionLock.unlock()
                return
            }
            completed = true
            completionLock.unlock()
            monitor.cancel()
            guard let self else {
                completion(.failure(StingNativeModuleError(
                    code: "E_NETWORK_UNAVAILABLE",
                    message: "Network module was released before state became available"
                )))
                return
            }
            completion(.success(self.payload(path)))
        }
        monitor.start(queue: queue)
    }

    public func setEventEnabled(
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeModuleEventEmitter
    ) throws {
        guard event == "change" else {
            throw StingNativeModuleError(
                code: "E_EVENT_NOT_FOUND",
                message: "Network does not implement native event \(event)"
            )
        }

        lock.lock()
        let previous = eventMonitor
        eventMonitor = nil
        lock.unlock()
        previous?.cancel()

        guard enabled else { return }

        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            emit(self.payload(path))
        }
        lock.lock()
        eventMonitor = monitor
        lock.unlock()
        monitor.start(queue: queue)
    }

    private func payload(_ path: NWPath) -> [String: Any] {
        [
            "connected": path.status == .satisfied,
            "internetReachable": path.status == .satisfied,
            "type": networkType(path),
            "expensive": path.isExpensive,
        ]
    }

    private func networkType(_ path: NWPath) -> String {
        if path.status != .satisfied { return "none" }
        if path.usesInterfaceType(.wifi) { return "wifi" }
        if path.usesInterfaceType(.cellular) { return "cellular" }
        if path.usesInterfaceType(.wiredEthernet) { return "ethernet" }
        return "other"
    }
}
