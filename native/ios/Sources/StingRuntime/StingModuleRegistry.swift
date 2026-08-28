import CoreFoundation
import Foundation

public final class StingModuleRegistry {
    private struct NativeObjectEntry {
        let module: String
        let value: any StingNativeObject
    }

    private var modules: [String: any StingNativeModule] = [:]
    private let objectLock = NSLock()
    private var objects: [Int: NativeObjectEntry] = [:]
    private var nextObjectHandle = 1

    public init(modules: [any StingNativeModule] = []) throws {
        for module in modules {
            try register(module)
        }
    }

    public func register(_ module: any StingNativeModule) throws {
        guard modules[module.name] == nil else {
            throw StingNativeModuleError(
                code: "E_DUPLICATE_MODULE",
                message: "A native module named \(module.name) is already registered"
            )
        }
        modules[module.name] = module
    }

    public func versions() -> [String: String] {
        Dictionary(uniqueKeysWithValues: modules.values.map { ($0.name, $0.version) })
    }

    public func createView(module name: String, type: String) throws -> any StingNativeView {
        try requireModule(name).createView(type: type)
    }

    public func callSync(module name: String, method: String, arguments: [Any]) throws -> Any? {
        let module = try requireModule(name)

        switch method {
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

    public func disposeAllObjects() {
        objectLock.lock()
        let active = objects.keys.sorted().compactMap { objects[$0] }
        objects.removeAll(keepingCapacity: false)
        objectLock.unlock()

        for entry in active {
            entry.value.dispose()
        }
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

    private static let objectCreateMethod = "__sting_object_create"
    private static let objectCallSyncMethod = "__sting_object_call_sync"
    private static let objectCallAsyncMethod = "__sting_object_call_async"
    private static let objectDisposeMethod = "__sting_object_dispose"
}
