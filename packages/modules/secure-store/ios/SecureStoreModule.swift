import Foundation
import Security
import StingRuntime

public final class SecureStoreModule: StingNativeModule {
    public let name = "SecureStore"
    public let version = "0.1.0"

    private let queue = DispatchQueue(label: "run.stingjs.modules.secure-store", qos: .utility)

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(
            code: "E_SYNC_UNSUPPORTED",
            message: "SecureStore methods are asynchronous"
        )
    }

    public func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        queue.async { [self] in
            do {
                completion(.success(try perform(method: method, arguments: arguments)))
            } catch let error as StingNativeModuleError {
                completion(.failure(error))
            } catch {
                completion(.failure(StingNativeModuleError(
                    code: "E_SECURE_STORE",
                    message: error.localizedDescription,
                    details: ["method": method]
                )))
            }
        }
    }

    private func perform(method: String, arguments: [Any]) throws -> Any? {
        switch method {
        case "getItem":
            let (key, namespace) = try keyAndNamespace(arguments)
            return try read(key: key, namespace: namespace)
        case "setItem":
            guard arguments.count >= 3, let value = arguments[1] as? String, !value.isEmpty else {
                throw invalidArgument("SecureStore.setItem requires a non-empty string value")
            }
            let key = try requireString(arguments, index: 0, label: "key")
            let namespace = try requireString(arguments, index: 2, label: "namespace")
            try write(value: value, key: key, namespace: namespace)
            return nil
        case "deleteItem":
            let (key, namespace) = try keyAndNamespace(arguments)
            try delete(key: key, namespace: namespace)
            return nil
        case "hasItem":
            let (key, namespace) = try keyAndNamespace(arguments)
            return try exists(key: key, namespace: namespace)
        default:
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "SecureStore does not implement asynchronous method \(method)"
            )
        }
    }

    private func keyAndNamespace(_ arguments: [Any]) throws -> (String, String) {
        (
            try requireString(arguments, index: 0, label: "key"),
            try requireString(arguments, index: 1, label: "namespace")
        )
    }

    private func requireString(_ arguments: [Any], index: Int, label: String) throws -> String {
        guard index < arguments.count, let value = arguments[index] as? String, !value.isEmpty else {
            throw invalidArgument("SecureStore \(label) must be a non-empty string")
        }
        return value
    }

    private func service(_ namespace: String) -> String {
        "run.stingjs.secure-store.\(namespace)"
    }

    private func baseQuery(key: String, namespace: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service(namespace),
            kSecAttrAccount as String: key,
        ]
    }

    private func read(key: String, namespace: String) throws -> String? {
        var query = baseQuery(key: key, namespace: namespace)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        try requireSuccess(status, operation: "read")

        guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            throw StingNativeModuleError(
                code: "E_SECURE_STORE",
                message: "SecureStore value is not valid UTF-8"
            )
        }
        return value
    }

    private func write(value: String, key: String, namespace: String) throws {
        let data = Data(value.utf8)
        let query = baseQuery(key: key, namespace: namespace)
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )

        if updateStatus == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            try requireSuccess(SecItemAdd(add as CFDictionary, nil), operation: "write")
            return
        }
        try requireSuccess(updateStatus, operation: "write")
    }

    private func delete(key: String, namespace: String) throws {
        let status = SecItemDelete(baseQuery(key: key, namespace: namespace) as CFDictionary)
        if status == errSecItemNotFound { return }
        try requireSuccess(status, operation: "delete")
    }

    private func exists(key: String, namespace: String) throws -> Bool {
        var query = baseQuery(key: key, namespace: namespace)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnAttributes as String] = true
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecItemNotFound { return false }
        try requireSuccess(status, operation: "inspect")
        return true
    }

    private func requireSuccess(_ status: OSStatus, operation: String) throws {
        guard status == errSecSuccess else {
            let message = SecCopyErrorMessageString(status, nil) as String? ?? "OSStatus \(status)"
            throw StingNativeModuleError(
                code: "E_SECURE_STORE",
                message: "SecureStore \(operation) failed: \(message)",
                details: ["status": Int(status)]
            )
        }
    }

    private func invalidArgument(_ message: String) -> StingNativeModuleError {
        StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: message)
    }
}
