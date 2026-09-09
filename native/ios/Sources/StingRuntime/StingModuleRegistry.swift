import CoreFoundation
import Foundation
import UIKit

public final class StingModuleRegistry {
    private struct NativeObjectEntry {
        let module: String
        let value: any StingNativeObject
    }

    private struct PermissionRequestKey: Hashable {
        let module: String
        let permission: String
    }

    private struct PendingPermissionRequest {
        let id: UInt64
        var waiters: [StingNativeModuleCompletion]
    }

    private var modules: [String: any StingNativeModule] = [:]
    private var moduleOrder: [String] = []
    private let objectLock = NSLock()
    private var objects: [Int: NativeObjectEntry] = [:]
    private var nextObjectHandle = 1
    private let permissionLock = NSLock()
    private var pendingPermissionRequests: [PermissionRequestKey: PendingPermissionRequest] = [:]
    private var nextPermissionRequestID: UInt64 = 1
    private var permissionRequestsDisposed = false
    private var lifecycleObservers: [NSObjectProtocol] = []
    private var runtimeDisposingDelivered = false

    public init(modules: [any StingNativeModule] = []) throws {
        for module in modules {
            try register(module)
        }
        startLifecycleObservation()
    }

    deinit {
        disposePendingPermissionRequests()
        stopLifecycleObservation()
    }

    public func register(_ module: any StingNativeModule) throws {
        guard modules[module.name] == nil else {
            throw StingNativeModuleError(
                code: "E_DUPLICATE_MODULE",
                message: "A native module named \(module.name) is already registered"
            )
        }
        modules[module.name] = module
        moduleOrder.append(module.name)
    }

    public func versions() -> [String: String] {
        Dictionary(uniqueKeysWithValues: moduleOrder.compactMap { name in
            modules[name].map { (name, $0.version) }
        })
    }

    public func createView(module name: String, type: String) throws -> any StingNativeView {
        try requireModule(name).createView(type: type)
    }

    public func callSync(module name: String, method: String, arguments: [Any]) throws -> Any? {
        let module = try requireModule(name)

        switch method {
        case Self.permissionStatusMethod:
            let permission = try requirePermissionArgument(arguments)
            return try module.permissionStatus(for: permission).rawValue

        case Self.objectCreateMethod:
            let type = try requireStringArgument(arguments, index: 0, label: "native object type")
            return try createObject(module: module, type: type, arguments: Array(arguments.dropFirst()))

        case Self.objectCallSyncMethod:
            let handle = try requireHandleArgument(arguments)
            let objectMethod = try requireStringArgument(arguments, index: 1, label: "native object method")
            let object = try requireObject(module: name, handle: handle)
            return try object.callSync(method: objectMethod, arguments: Array(arguments.dropFirst(2)))

        case Self.objectDisposeMethod:
            let handle = try requireHandleArgument(arguments)
            try disposeObject(module: name, handle: handle)
            return nil

        default:
            return try module.callSync(method: method, arguments: arguments)
        }
    }

    public func callAsync(
        module name: String,
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        guard let module = modules[name] else {
            completion(.failure(StingNativeModuleError(
                code: "E_MODULE_NOT_FOUND",
                message: "Native module \(name) is not registered"
            )))
            return
        }

        if method == Self.permissionRequestMethod {
            do {
                let permission = try requirePermissionArgument(arguments)
                requestPermission(
                    moduleName: name,
                    module: module,
                    permission: permission,
                    completion: completion
                )
            } catch {
                completion(.failure(error))
            }
            return
        }

        if method == Self.objectCallAsyncMethod {
            do {
                let handle = try requireHandleArgument(arguments)
                let objectMethod = try requireStringArgument(
                    arguments,
                    index: 1,
                    label: "native object method"
                )
                let object = try requireObject(module: name, handle: handle)
                object.callAsync(
                    method: objectMethod,
                    arguments: Array(arguments.dropFirst(2)),
                    completion: completion
                )
            } catch {
                completion(.failure(error))
            }
            return
        }

        module.callAsync(method: method, arguments: arguments, completion: completion)
    }

    public func setEventEnabled(
        module name: String,
        event: String,
        enabled: Bool,
        emit: @escaping StingNativeModuleEventEmitter
    ) throws {
        let module = try requireModule(name)
        try module.setEventEnabled(event: event, enabled: enabled, emit: emit)
    }

    /// Delivers a semantic lifecycle transition to every registered module in
    /// registration order. Runtime disposal is a one-shot terminal transition.
    public func dispatchLifecycle(_ event: StingApplicationLifecycleEvent) {
        if event == .runtimeDisposing {
            guard !runtimeDisposingDelivered else { return }
            runtimeDisposingDelivered = true
            stopLifecycleObservation()
            disposePendingPermissionRequests()
        } else if runtimeDisposingDelivered {
            return
        }

        for name in moduleOrder {
            modules[name]?.applicationLifecycleDidChange(event)
        }
    }

    /// Routes background work to one module. Platform task/session objects stay
    /// outside the module boundary; only portable payload data crosses it.
    public func deliverBackgroundEvent(
        module name: String,
        event: String,
        payload: Any?,
        completion: @escaping StingNativeModuleCompletion
    ) {
        guard !event.isEmpty else {
            completion(.failure(StingNativeModuleError(
                code: "E_INVALID_BACKGROUND_EVENT",
                message: "Background event name must not be empty"
            )))
            return
        }
        guard let module = modules[name] else {
            completion(.failure(StingNativeModuleError(
                code: "E_MODULE_NOT_FOUND",
                message: "Native module \(name) is not registered"
            )))
            return
        }
        guard !runtimeDisposingDelivered else {
            completion(.failure(StingNativeModuleError(
                code: "E_RUNTIME_DISPOSED",
                message: "Sting runtime is already disposing"
            )))
            return
        }

        module.handleBackgroundEvent(name: event, payload: payload, completion: completion)
    }

    /// Final module ownership cleanup for one Sting runtime.
    public func dispose() {
        dispatchLifecycle(.runtimeDisposing)
        disposeAllObjects()
    }

    public func disposeAllObjects() {
        objectLock.lock()
        let active = objects.keys.sorted().compactMap { objects[$0] }
        objects.removeAll(keepingCapacity: false)
        objectLock.unlock()

        for entry in active {
            entry.value.dispose()
        }
    }

    private func requestPermission(
        moduleName: String,
        module: any StingNativeModule,
        permission: String,
        completion: @escaping StingNativeModuleCompletion
    ) {
        let key = PermissionRequestKey(module: moduleName, permission: permission)

        permissionLock.lock()
        if permissionRequestsDisposed {
            permissionLock.unlock()
            completion(.failure(runtimeDisposedError()))
            return
        }

        if var pending = pendingPermissionRequests[key] {
            pending.waiters.append(completion)
            pendingPermissionRequests[key] = pending
            permissionLock.unlock()
            return
        }

        let requestID = nextPermissionRequestID
        nextPermissionRequestID &+= 1
        if nextPermissionRequestID == 0 {
            nextPermissionRequestID = 1
        }
        pendingPermissionRequests[key] = PendingPermissionRequest(
            id: requestID,
            waiters: [completion]
        )
        permissionLock.unlock()

        module.requestPermission(permission) { [weak self] result in
            self?.completePermissionRequest(key: key, requestID: requestID, result: result)
        }
    }

    private func completePermissionRequest(
        key: PermissionRequestKey,
        requestID: UInt64,
        result: Result<StingPermissionStatus, Error>
    ) {
        permissionLock.lock()
        guard !permissionRequestsDisposed,
              let pending = pendingPermissionRequests[key],
              pending.id == requestID else {
            permissionLock.unlock()
            return
        }
        pendingPermissionRequests.removeValue(forKey: key)
        let waiters = pending.waiters
        permissionLock.unlock()

        for waiter in waiters {
            switch result {
            case .success(let status):
                waiter(.success(status.rawValue))
            case .failure(let error):
                waiter(.failure(error))
            }
        }
    }

    private func disposePendingPermissionRequests() {
        permissionLock.lock()
        guard !permissionRequestsDisposed else {
            permissionLock.unlock()
            return
        }
        permissionRequestsDisposed = true
        let waiters = pendingPermissionRequests.values.flatMap(\.waiters)
        pendingPermissionRequests.removeAll(keepingCapacity: false)
        permissionLock.unlock()

        for waiter in waiters {
            waiter(.failure(runtimeDisposedError()))
        }
    }

    private func runtimeDisposedError() -> StingNativeModuleError {
        StingNativeModuleError(
            code: "E_RUNTIME_DISPOSED",
            message: "Sting runtime is already disposing"
        )
    }

    private func startLifecycleObservation() {
        let center = NotificationCenter.default
        lifecycleObservers = [
            center.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.dispatchLifecycle(.foreground)
            },
            center.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.dispatchLifecycle(.active)
            },
            center.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.dispatchLifecycle(.inactive)
            },
            center.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.dispatchLifecycle(.background)
            },
        ]
    }

    private func stopLifecycleObservation() {
        guard !lifecycleObservers.isEmpty else { return }
        let center = NotificationCenter.default
        for observer in lifecycleObservers {
            center.removeObserver(observer)
        }
        lifecycleObservers.removeAll(keepingCapacity: false)
    }

    private func requireModule(_ name: String) throws -> any StingNativeModule {
        guard let module = modules[name] else {
            throw StingNativeModuleError(
                code: "E_MODULE_NOT_FOUND",
                message: "Native module \(name) is not registered"
            )
        }
        return module
    }

    private func createObject(
        module: any StingNativeModule,
        type: String,
        arguments: [Any]
    ) throws -> Int {
        let value = try module.createObject(type: type, arguments: arguments)

        objectLock.lock()
        defer { objectLock.unlock() }

        guard nextObjectHandle > 0 else {
            throw StingNativeModuleError(
                code: "E_OBJECT_HANDLE_EXHAUSTED",
                message: "Native object handle space is exhausted for this Sting runtime"
            )
        }

        let handle = nextObjectHandle
        nextObjectHandle = handle == Int.max ? 0 : handle + 1
        objects[handle] = NativeObjectEntry(module: module.name, value: value)
        return handle
    }

    private func requireObject(module name: String, handle: Int) throws -> any StingNativeObject {
        objectLock.lock()
        defer { objectLock.unlock() }

        guard let entry = objects[handle] else {
            throw StingNativeModuleError(
                code: "E_OBJECT_NOT_FOUND",
                message: "Native object handle \(handle) is stale or unknown",
                details: ["handle": handle]
            )
        }

        guard entry.module == name else {
            throw StingNativeModuleError(
                code: "E_OBJECT_MODULE_MISMATCH",
                message: "Native object handle \(handle) belongs to \(entry.module), not \(name)",
                details: ["handle": handle, "owner": entry.module]
            )
        }

        return entry.value
    }

    private func disposeObject(module name: String, handle: Int) throws {
        objectLock.lock()

        guard let entry = objects[handle] else {
            objectLock.unlock()
            throw StingNativeModuleError(
                code: "E_OBJECT_NOT_FOUND",
                message: "Native object handle \(handle) is stale or unknown",
                details: ["handle": handle]
            )
        }

        guard entry.module == name else {
            objectLock.unlock()
            throw StingNativeModuleError(
                code: "E_OBJECT_MODULE_MISMATCH",
                message: "Native object handle \(handle) belongs to \(entry.module), not \(name)",
                details: ["handle": handle, "owner": entry.module]
            )
        }

        objects.removeValue(forKey: handle)
        objectLock.unlock()
        entry.value.dispose()
    }

    private func requireHandleArgument(_ arguments: [Any]) throws -> Int {
        guard let number = arguments.first as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID() else {
            throw StingNativeModuleError(
                code: "E_INVALID_OBJECT_HANDLE",
                message: "Native object operation requires a positive integer handle"
            )
        }

        let handle = number.intValue
        guard handle > 0, number.doubleValue == Double(handle) else {
            throw StingNativeModuleError(
                code: "E_INVALID_OBJECT_HANDLE",
                message: "Native object operation requires a positive integer handle",
                details: number
            )
        }
        return handle
    }

    private func requirePermissionArgument(_ arguments: [Any]) throws -> String {
        guard let permission = arguments.first as? String else {
            throw StingNativeModuleError(
                code: "E_INVALID_PERMISSION",
                message: "Native permission name must be a non-empty string"
            )
        }
        let normalized = permission.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            throw StingNativeModuleError(
                code: "E_INVALID_PERMISSION",
                message: "Native permission name must be a non-empty string"
            )
        }
        return normalized
    }

    private func requireStringArgument(
        _ arguments: [Any],
        index: Int,
        label: String
    ) throws -> String {
        guard index < arguments.count,
              let value = arguments[index] as? String,
              !value.isEmpty else {
            throw StingNativeModuleError(
                code: "E_INVALID_OBJECT_ARGUMENT",
                message: "\(label) must be a non-empty string"
            )
        }
        return value
    }

    private static let permissionStatusMethod = "__sting_permission_status"
    private static let permissionRequestMethod = "__sting_permission_request"
    private static let objectCreateMethod = "__sting_object_create"
    private static let objectCallSyncMethod = "__sting_object_call_sync"
    private static let objectCallAsyncMethod = "__sting_object_call_async"
    private static let objectDisposeMethod = "__sting_object_dispose"
}
