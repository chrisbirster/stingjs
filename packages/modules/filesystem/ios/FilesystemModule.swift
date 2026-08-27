import Foundation
import StingRuntime

public final class FilesystemModule: StingNativeModule {
    public let name = "Filesystem"
    public let version = "0.1.0"

    private let fileManager: FileManager
    private let queue = DispatchQueue(
        label: "run.stingjs.modules.filesystem",
        qos: .utility,
        attributes: .concurrent
    )

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(
            code: "E_SYNC_UNSUPPORTED",
            message: "Filesystem methods are asynchronous"
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
                    code: "E_IO",
                    message: error.localizedDescription,
                    details: ["method": method]
                )))
            }
        }
    }

    private func perform(method: String, arguments: [Any]) throws -> Any? {
        switch method {
        case "readText":
            let target = try target(arguments: arguments, pathIndex: 0, directoryIndex: 1)
            try requireExistingFile(target)
            do {
                return try String(contentsOf: target, encoding: .utf8)
            } catch {
                throw ioError("Unable to read file", path: target.path, underlying: error)
            }

        case "writeText":
            guard arguments.count > 1, let contents = arguments[1] as? String else {
                throw invalidArgument("Filesystem.writeText requires string contents")
            }
            let target = try target(arguments: arguments, pathIndex: 0, directoryIndex: 2)
            try requireWritableTarget(target)
            do {
                try Data(contents.utf8).write(to: target, options: .atomic)
                return nil
            } catch {
                throw ioError("Unable to write file", path: target.path, underlying: error)
            }

        case "delete":
            let target = try target(arguments: arguments, pathIndex: 0, directoryIndex: 1)
            guard fileManager.fileExists(atPath: target.path) else {
                throw notFound(target)
            }
            do {
                try fileManager.removeItem(at: target)
                return nil
            } catch {
                throw ioError("Unable to delete path", path: target.path, underlying: error)
            }

        case "makeDirectory":
            let target = try target(arguments: arguments, pathIndex: 0, directoryIndex: 1)
            guard !fileManager.fileExists(atPath: target.path) else {
                throw StingNativeModuleError(
                    code: "E_ALREADY_EXISTS",
                    message: "Filesystem path already exists",
                    details: ["path": target.path]
                )
            }
            do {
                try fileManager.createDirectory(
                    at: target,
                    withIntermediateDirectories: true
                )
                return nil
            } catch {
                throw ioError("Unable to create directory", path: target.path, underlying: error)
            }

        case "getInfo":
            let target = try target(arguments: arguments, pathIndex: 0, directoryIndex: 1)
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: target.path, isDirectory: &isDirectory) else {
                return [
                    "exists": false,
                    "type": NSNull(),
                    "size": 0,
                    "modifiedAt": NSNull(),
                ] as [String: Any]
            }

            do {
                let attributes = try fileManager.attributesOfItem(atPath: target.path)
                let size = isDirectory.boolValue
                    ? 0
                    : (attributes[.size] as? NSNumber)?.doubleValue ?? 0
                let modifiedAt: Any
                if let date = attributes[.modificationDate] as? Date {
                    modifiedAt = date.timeIntervalSince1970 * 1_000
                } else {
                    modifiedAt = NSNull()
                }
                return [
                    "exists": true,
                    "type": isDirectory.boolValue ? "directory" : "file",
                    "size": size,
                    "modifiedAt": modifiedAt,
                ] as [String: Any]
            } catch {
                throw ioError("Unable to inspect path", path: target.path, underlying: error)
            }

        default:
            throw StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Filesystem does not implement asynchronous method \(method)"
            )
        }
    }

    private func target(
        arguments: [Any],
        pathIndex: Int,
        directoryIndex: Int
    ) throws -> URL {
        guard arguments.count > pathIndex, let path = arguments[pathIndex] as? String else {
            throw invalidArgument("Filesystem requires a relative path")
        }
        guard arguments.count > directoryIndex, let directory = arguments[directoryIndex] as? String else {
            throw invalidArgument("Filesystem requires a base directory")
        }
        return try resolve(path: path, directory: directory)
    }

    private func resolve(path: String, directory: String) throws -> URL {
        guard !path.isEmpty,
              !path.hasPrefix("/"),
              !path.contains("\\") else {
            throw invalidPath(path)
        }

        let components = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !components.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else {
            throw invalidPath(path)
        }

        let root: URL
        switch directory {
        case "documents":
            guard let value = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
                throw StingNativeModuleError(
                    code: "E_IO",
                    message: "Application documents directory is unavailable"
                )
            }
            root = value
        case "cache":
            guard let value = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
                throw StingNativeModuleError(
                    code: "E_IO",
                    message: "Application cache directory is unavailable"
                )
            }
            root = value
        default:
            throw invalidArgument("Filesystem base directory must be documents or cache")
        }

        let canonicalRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let canonicalTarget = canonicalRoot
            .appendingPathComponent(path)
            .standardizedFileURL
            .resolvingSymlinksInPath()
        let rootPrefix = canonicalRoot.path.hasSuffix("/")
            ? canonicalRoot.path
            : canonicalRoot.path + "/"

        guard canonicalTarget.path.hasPrefix(rootPrefix) else {
            throw invalidPath(path)
        }
        return canonicalTarget
    }

    private func requireExistingFile(_ target: URL) throws {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: target.path, isDirectory: &isDirectory) else {
            throw notFound(target)
        }
        guard !isDirectory.boolValue else {
            throw StingNativeModuleError(
                code: "E_IS_DIRECTORY",
                message: "Filesystem path is a directory",
                details: ["path": target.path]
            )
        }
    }

    private func requireWritableTarget(_ target: URL) throws {
        var isDirectory: ObjCBool = false
        if fileManager.fileExists(atPath: target.path, isDirectory: &isDirectory), isDirectory.boolValue {
            throw StingNativeModuleError(
                code: "E_IS_DIRECTORY",
                message: "Filesystem path is a directory",
                details: ["path": target.path]
            )
        }

        let parent = target.deletingLastPathComponent()
        var parentIsDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: parent.path, isDirectory: &parentIsDirectory),
              parentIsDirectory.boolValue else {
            throw StingNativeModuleError(
                code: "E_NOT_FOUND",
                message: "Filesystem parent directory does not exist",
                details: ["path": parent.path]
            )
        }
    }

    private func invalidArgument(_ message: String) -> StingNativeModuleError {
        StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: message)
    }

    private func invalidPath(_ path: String) -> StingNativeModuleError {
        StingNativeModuleError(
            code: "E_INVALID_PATH",
            message: "Filesystem paths must stay inside the selected app-private root",
            details: ["path": path]
        )
    }

    private func notFound(_ target: URL) -> StingNativeModuleError {
        StingNativeModuleError(
            code: "E_NOT_FOUND",
            message: "Filesystem path does not exist",
            details: ["path": target.path]
        )
    }

    private func ioError(_ message: String, path: String, underlying: Error) -> StingNativeModuleError {
        StingNativeModuleError(
            code: "E_IO",
            message: "\(message): \(underlying.localizedDescription)",
            details: ["path": path]
        )
    }
}
