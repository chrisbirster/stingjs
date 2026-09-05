import CoreLocation
import Foundation
import StingRuntime

public final class LocationModule: NSObject, StingNativeModule, CLLocationManagerDelegate {
    public let name = "Location"
    public let version = "0.1.0"

    private let manager = CLLocationManager()
    private let lock = NSLock()
    private var permissionCompletions: [StingPermissionCompletion] = []
    private var positionCompletions: [StingNativeModuleCompletion] = []
    private var eventEmitter: StingNativeModuleEventEmitter?
    private var observing = false

    public override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        if method == "isAvailable" { return CLLocationManager.locationServicesEnabled() }
        throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Location does not implement synchronous method \(method)")
    }

    public func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        guard method == "getCurrentPosition" else {
            completion(.failure(StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Location does not implement asynchronous method \(method)")))
            return
        }
        do {
            let status = try permissionStatus(for: "foreground")
            guard status == .granted || status == .limited else {
                completion(.failure(StingNativeModuleError(code: "E_LOCATION_PERMISSION", message: "Foreground location permission is required.")))
                return
            }
            lock.withLock { positionCompletions.append(completion) }
            manager.requestLocation()
        } catch { completion(.failure(error)) }
    }

    public func setEventEnabled(event: String, enabled: Bool, emit: @escaping StingNativeModuleEventEmitter) throws {
        guard event == "change" else { throw StingNativeModuleError(code: "E_EVENT_NOT_FOUND", message: "Location does not implement event \(event)") }
        if enabled {
            let status = try permissionStatus(for: "foreground")
            guard status == .granted || status == .limited else { throw StingNativeModuleError(code: "E_LOCATION_PERMISSION", message: "Foreground location permission is required.") }
            lock.withLock { eventEmitter = emit; observing = true }
            manager.startUpdatingLocation()
        } else {
            lock.withLock { eventEmitter = nil; observing = false }
            manager.stopUpdatingLocation()
        }
    }

    public func permissionStatus(for permission: String) throws -> StingPermissionStatus {
        guard permission == "foreground" else { throw StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Location does not implement permission \(permission)") }
        switch manager.authorizationStatus {
        case .notDetermined: return .undetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .authorizedAlways, .authorizedWhenInUse: return .granted
        @unknown default: return .denied
        }
    }

    public func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
        guard permission == "foreground" else {
            completion(.failure(StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Location does not implement permission \(permission)")))
            return
        }
        do {
            let current = try permissionStatus(for: permission)
            guard current == .undetermined else { completion(.success(current)); return }
            lock.withLock { permissionCompletions.append(completion) }
            manager.requestWhenInUseAuthorization()
        } catch { completion(.failure(error)) }
    }

    public func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
        switch event {
        case .background:
            manager.stopUpdatingLocation()
        case .active:
            if lock.withLock({ observing }) { manager.startUpdatingLocation() }
        case .runtimeDisposing:
            manager.stopUpdatingLocation()
            manager.delegate = nil
            let pending = lock.withLock { () -> ([StingPermissionCompletion], [StingNativeModuleCompletion]) in
                let permissions = permissionCompletions
                let positions = positionCompletions
                permissionCompletions.removeAll(keepingCapacity: false)
                positionCompletions.removeAll(keepingCapacity: false)
                eventEmitter = nil
                observing = false
                return (permissions, positions)
            }
            let error = StingNativeModuleError(code: "E_RUNTIME_DISPOSED", message: "Sting runtime is already disposing")
            pending.0.forEach { $0(.failure(error)) }
            pending.1.forEach { $0(.failure(error)) }
        default:
            break
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        let status = (try? permissionStatus(for: "foreground")) ?? .denied
        let completions = lock.withLock { let values = permissionCompletions; permissionCompletions.removeAll(); return values }
        completions.forEach { $0(.success(status)) }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        let payload = Self.payload(location)
        let completions = lock.withLock { let values = positionCompletions; positionCompletions.removeAll(); return values }
        completions.forEach { $0(.success(payload)) }
        lock.withLock { eventEmitter }?(payload)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let wrapped = StingNativeModuleError(code: "E_LOCATION", message: error.localizedDescription)
        let completions = lock.withLock { let values = positionCompletions; positionCompletions.removeAll(); return values }
        completions.forEach { $0(.failure(wrapped)) }
    }

    private static func optionalCoordinate(_ valid: Bool, _ value: Double) -> Any {
        valid ? value : NSNull()
    }

    private static func payload(_ location: CLLocation) -> [String: Any] {
        return [
            "coords": [
                "latitude": location.coordinate.latitude,
                "longitude": location.coordinate.longitude,
                "altitude": optionalCoordinate(location.verticalAccuracy >= 0, location.altitude),
                "accuracy": location.horizontalAccuracy,
                "altitudeAccuracy": optionalCoordinate(location.verticalAccuracy >= 0, location.verticalAccuracy),
                "heading": optionalCoordinate(location.course >= 0, location.course),
                "speed": optionalCoordinate(location.speed >= 0, location.speed),
            ] as [String: Any],
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
        ]
    }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T { lock(); defer { unlock() }; return body() }
}
