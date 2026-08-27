import Foundation

public final class StingModuleRegistry {
    private var modules: [String: any StingNativeModule] = [:]

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

    public func callSync(module name: String, method: String, arguments: [Any]) throws -> Any? {
        guard let module = modules[name] else {
            throw StingNativeModuleError(
                code: "E_MODULE_NOT_FOUND",
                message: "Native module \(name) is not registered"
            )
        }

        return try module.callSync(method: method, arguments: arguments)
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

        module.callAsync(method: method, arguments: arguments, completion: completion)
    }
}
