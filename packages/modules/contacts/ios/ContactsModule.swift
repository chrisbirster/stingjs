import Contacts
import ContactsUI
import Foundation
import StingRuntime
import UIKit

public final class ContactsModule: NSObject, StingNativeModule, CNContactPickerDelegate {
    public let name = "Contacts"
    public let version = "0.1.0"

    private let store = CNContactStore()
    private let queue = DispatchQueue(label: "run.stingjs.modules.contacts", qos: .userInitiated)
    private var pickerCompletion: StingNativeModuleCompletion?
    private var picker: CNContactPickerViewController?

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Contacts does not implement synchronous method \(method)")
    }

    public func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        switch method {
        case "getContacts":
            let limit = max(1, min((arguments.first as? NSNumber)?.intValue ?? 100, 1000))
            guard isAuthorized else {
                completion(.failure(StingNativeModuleError(code: "E_CONTACTS_PERMISSION", message: "Contacts permission is required.")))
                return
            }
            queue.async { [self] in
                do { completion(.success(try readContacts(limit: limit))) }
                catch let error as StingNativeModuleError { completion(.failure(error)) }
                catch { completion(.failure(StingNativeModuleError(code: "E_CONTACTS", message: error.localizedDescription))) }
            }
        case "pickContact":
            guard isAuthorized else {
                completion(.failure(StingNativeModuleError(code: "E_CONTACTS_PERMISSION", message: "Contacts permission is required.")))
                return
            }
            DispatchQueue.main.async { [weak self] in self?.presentPicker(completion) }
        default:
            completion(.failure(StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Contacts does not implement asynchronous method \(method)")))
        }
    }

    public func permissionStatus(for permission: String) throws -> StingPermissionStatus {
        guard permission == "contacts" else { throw StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Contacts does not implement permission \(permission)") }
        let status = CNContactStore.authorizationStatus(for: .contacts)
        if #available(iOS 18.0, *), status == .limited { return .limited }
        switch status {
        case .notDetermined: return .undetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .authorized: return .granted
        @unknown default: return .denied
        }
    }

    public func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
        guard permission == "contacts" else {
            completion(.failure(StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Contacts does not implement permission \(permission)")))
            return
        }
        let current = (try? permissionStatus(for: permission)) ?? .denied
        guard current == .undetermined else { completion(.success(current)); return }
        store.requestAccess(for: .contacts) { [weak self] _, error in
            if let error { completion(.failure(StingNativeModuleError(code: "E_CONTACTS_PERMISSION", message: error.localizedDescription))); return }
            completion(.success((try? self?.permissionStatus(for: permission)) ?? .denied))
        }
    }

    public func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) { finishPicker(.success(Self.payload(contact))) }
    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) { finishPicker(.success(nil)) }

    private var isAuthorized: Bool {
        let status = (try? permissionStatus(for: "contacts")) ?? .denied
        return status == .granted || status == .limited
    }

    private func readContacts(limit: Int) throws -> [[String: Any]] {
        var values: [[String: Any]] = []
        let keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor, CNContactGivenNameKey as CNKeyDescriptor, CNContactFamilyNameKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor, CNContactEmailAddressesKey as CNKeyDescriptor]
        let request = CNContactFetchRequest(keysToFetch: keys)
        try store.enumerateContacts(with: request) { contact, stop in
            values.append(Self.payload(contact))
            if values.count >= limit { stop.pointee = true }
        }
        return values
    }

    private func presentPicker(_ completion: @escaping StingNativeModuleCompletion) {
        guard pickerCompletion == nil else { completion(.failure(StingNativeModuleError(code: "E_CONTACTS_PICKER_BUSY", message: "A contact picker is already active."))); return }
        guard let presenter = Self.topViewController() else { completion(.failure(StingNativeModuleError(code: "E_CONTACTS_PRESENTATION", message: "No active view controller is available."))); return }
        let controller = CNContactPickerViewController()
        controller.delegate = self
        pickerCompletion = completion
        picker = controller
        presenter.present(controller, animated: true)
    }

    private func finishPicker(_ result: Result<Any?, Error>) {
        let completion = pickerCompletion
        pickerCompletion = nil
        picker = nil
        completion?(result)
    }

    private static func payload(_ contact: CNContact) -> [String: Any] {
        let displayName = [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")
        return ["id": contact.identifier, "givenName": contact.givenName, "familyName": contact.familyName, "displayName": displayName, "phones": contact.phoneNumbers.map { $0.value.stringValue }, "emails": contact.emailAddresses.map { String($0.value) }]
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.filter { $0.activationState == .foregroundActive }
        var controller = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController
        while let presented = controller?.presentedViewController { controller = presented }
        return controller
    }
}
