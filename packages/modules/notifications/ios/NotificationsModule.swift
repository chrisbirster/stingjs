import Foundation
import StingRuntime
import UserNotifications

public final class NotificationsModule: NSObject, StingNativeModule, UNUserNotificationCenterDelegate {
    public let name = "Notifications"
    public let version = "0.1.0"
    private let center = UNUserNotificationCenter.current()
    private var emitters: [String: StingNativeModuleEventEmitter] = [:]

    public override init() { super.init() }

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Notifications does not implement synchronous method \(method)")
    }

    public func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        switch method {
        case "schedule":
            let identifier = ((arguments.first as? String)?.isEmpty == false ? arguments.first as? String : nil) ?? UUID().uuidString
            guard arguments.count > 1, let title = arguments[1] as? String else { completion(.failure(StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: "Notifications.schedule requires a title."))); return }
            let body = arguments.count > 2 ? (arguments[2] as? String ?? "") : ""
            let at = arguments.count > 3 ? (arguments[3] as? NSNumber)?.doubleValue ?? 0 : 0
            let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default
            let trigger: UNNotificationTrigger? = at > Date().timeIntervalSince1970 * 1000 + 1000 ? UNTimeIntervalNotificationTrigger(timeInterval: max(1, at / 1000 - Date().timeIntervalSince1970), repeats: false) : nil
            center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)) { error in
                if let error { completion(.failure(StingNativeModuleError(code: "E_NOTIFICATIONS_SCHEDULE", message: error.localizedDescription))) } else { completion(.success(identifier)) }
            }
        case "getScheduled":
            center.getPendingNotificationRequests { requests in
                completion(.success(requests.map { request in
                    let date = (request.trigger as? UNTimeIntervalNotificationTrigger)?.nextTriggerDate()?.timeIntervalSince1970
                    return ["id": request.identifier, "title": request.content.title, "body": request.content.body, "at": date.map { $0 * 1000 } ?? NSNull()] as [String: Any]
                }))
            }
        case "cancel":
            guard let id = arguments.first as? String else { completion(.failure(StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: "Notifications.cancel requires an id."))); return }
            center.removePendingNotificationRequests(withIdentifiers: [id]); completion(.success(nil))
        default: completion(.failure(StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Notifications does not implement asynchronous method \(method)")))
        }
    }

    public func setEventEnabled(event: String, enabled: Bool, emit: @escaping StingNativeModuleEventEmitter) throws {
        guard event == "received" || event == "opened" else { throw StingNativeModuleError(code: "E_EVENT_NOT_FOUND", message: "Notifications does not implement event \(event)") }
        if enabled { emitters[event] = emit; center.delegate = self } else { emitters.removeValue(forKey: event); if emitters.isEmpty, center.delegate === self { center.delegate = nil } }
    }

    public func applicationLifecycleDidChange(_ event: StingApplicationLifecycleEvent) {
        guard event == .runtimeDisposing else { return }
        emitters.removeAll(keepingCapacity: false)
        if center.delegate === self { center.delegate = nil }
    }

    public func permissionStatus(for permission: String) throws -> StingPermissionStatus {
        guard permission == "notifications" else { throw StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Notifications does not implement permission \(permission)") }
        let semaphore = DispatchSemaphore(value: 0)
        var result: StingPermissionStatus = .undetermined
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .notDetermined: result = .undetermined
            case .denied: result = .denied
            case .authorized: result = .granted
            case .provisional, .ephemeral: result = .limited
            @unknown default: result = .denied
            }
            semaphore.signal()
        }
        semaphore.wait()
        return result
    }

    public func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
        guard permission == "notifications" else { completion(.failure(StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Notifications does not implement permission \(permission)"))); return }
        center.requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, error in
            if let error { completion(.failure(StingNativeModuleError(code: "E_NOTIFICATIONS_PERMISSION", message: error.localizedDescription))); return }
            completion(.success((try? self?.permissionStatus(for: permission)) ?? .denied))
        }
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        emitters["received"]?(Self.payload(notification.request)); completionHandler([.banner, .sound])
    }
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        emitters["opened"]?(Self.payload(response.notification.request)); completionHandler()
    }
    private static func payload(_ request: UNNotificationRequest) -> [String: Any] { ["id": request.identifier, "title": request.content.title, "body": request.content.body] }
}
