import Foundation
import JavaScriptCore

@objc protocol StingJavaScriptBridgeExports: JSExport {
    func getRuntimeInfo() -> String
    func createElement(_ id: Int, _ type: String)
    func createTextNode(_ id: Int, _ value: String)
    func replaceText(_ id: Int, _ value: String)
    func setProperty(_ id: Int, _ name: String, _ valueJSON: String)
    func insertNode(_ parentId: Int, _ nodeId: Int, _ anchorId: Int)
    func removeNode(_ parentId: Int, _ nodeId: Int)
    func setEventEnabled(_ id: Int, _ event: String, _ enabled: Bool)
    func callModuleSync(_ module: String, _ method: String, _ argsJSON: String) -> String
}

final class StingJavaScriptBridge: NSObject, StingJavaScriptBridgeExports {
    private let nodes: StingNodeRegistry
    private let modules: StingModuleRegistry
    private let reportError: (Error) -> Void

    init(nodes: StingNodeRegistry, modules: StingModuleRegistry, reportError: @escaping (Error) -> Void) {
        self.nodes = nodes
        self.modules = modules
        self.reportError = reportError
    }

    func getRuntimeInfo() -> String {
        encodeJSON([
            "protocolVersion": 1,
            "platform": "ios",
            "modules": modules.versions()
        ])
    }

    func createElement(_ id: Int, _ type: String) {
        perform { try nodes.createElement(id: id, type: type) }
    }

    func createTextNode(_ id: Int, _ value: String) {
        perform { try nodes.createTextNode(id: id, value: value) }
    }

    func replaceText(_ id: Int, _ value: String) {
        perform { try nodes.replaceText(id: id, value: value) }
    }

    func setProperty(_ id: Int, _ name: String, _ valueJSON: String) {
        perform { try nodes.setProperty(id: id, name: name, valueJSON: valueJSON) }
    }

    func insertNode(_ parentId: Int, _ nodeId: Int, _ anchorId: Int) {
        perform { try nodes.insertNode(parentId: parentId, nodeId: nodeId, anchorId: anchorId) }
    }

    func removeNode(_ parentId: Int, _ nodeId: Int) {
        perform { try nodes.removeNode(parentId: parentId, nodeId: nodeId) }
    }

    func setEventEnabled(_ id: Int, _ event: String, _ enabled: Bool) {
        perform { try nodes.setEventEnabled(id: id, event: event, enabled: enabled) }
    }

    func callModuleSync(_ module: String, _ method: String, _ argsJSON: String) -> String {
        do {
            let data = Data(argsJSON.utf8)
            let arguments = try JSONSerialization.jsonObject(with: data) as? [Any] ?? []
            let value = try modules.callSync(module: module, method: method, arguments: arguments)
            return encodeJSON(["ok": true, "value": value ?? NSNull()])
        } catch let error as StingNativeModuleError {
            var nativeError: [String: Any] = [
                "code": error.code,
                "message": error.message,
                "module": module,
                "method": method
            ]
            if let details = error.details { nativeError["details"] = details }
            return encodeJSON(["ok": false, "error": nativeError])
        } catch {
            return encodeJSON([
                "ok": false,
                "error": [
                    "code": "E_NATIVE_CALL",
                    "message": error.localizedDescription,
                    "module": module,
                    "method": method
                ]
            ])
        }
    }

    private func perform(_ operation: () throws -> Void) {
        do {
            try operation()
        } catch {
            reportError(error)
        }
    }

    private func encodeJSON(_ object: Any) -> String {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }
}
