import Foundation
import StingRuntime
import UIKit

public final class SharingModule: StingNativeModule {
    public let name = "Sharing"
    public let version = "0.1.0"

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(
            code: "E_SYNC_UNSUPPORTED",
            message: "Sharing methods are asynchronous"
        )
    }

    public func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        guard method == "share" else {
            completion(.failure(StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "Sharing does not implement asynchronous method \(method)"
            )))
            return
        }

        do {
            let payload = try parse(arguments)
            DispatchQueue.main.async { [self] in
                guard let presenter = presentationController() else {
                    completion(.failure(StingNativeModuleError(
                        code: "E_SHARE_UNAVAILABLE",
                        message: "Sharing has no active native presentation context"
                    )))
                    return
                }

                var items: [Any] = []
                if !payload.text.isEmpty { items.append(payload.text) }
                if let url = payload.url { items.append(url) }

                let controller = UIActivityViewController(
                    activityItems: items,
                    applicationActivities: nil
                )
                if !payload.subject.isEmpty {
                    controller.setValue(payload.subject, forKey: "subject")
                }
                if let popover = controller.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(
                        x: presenter.view.bounds.midX,
                        y: presenter.view.bounds.midY,
                        width: 1,
                        height: 1
                    )
                    popover.permittedArrowDirections = []
                }
                controller.completionWithItemsHandler = { _, _, _, error in
                    if let error {
                        completion(.failure(StingNativeModuleError(
                            code: "E_SHARE_FAILED",
                            message: error.localizedDescription
                        )))
                    } else {
                        completion(.success(nil))
                    }
                }
                presenter.present(controller, animated: true)
            }
        } catch {
            completion(.failure(error))
        }
    }

    private struct Payload {
        let text: String
        let url: URL?
        let subject: String
    }

    private func parse(_ arguments: [Any]) throws -> Payload {
        guard arguments.count >= 3,
              let text = arguments[0] as? String,
              let urlString = arguments[1] as? String,
              let subject = arguments[2] as? String else {
            throw invalidArgument("Sharing.share requires text, url, and subject string slots")
        }
        guard !text.isEmpty || !urlString.isEmpty else {
            throw invalidArgument("Sharing.share requires text or url")
        }

        let url: URL?
        if urlString.isEmpty {
            url = nil
        } else if let parsed = URL(string: urlString), parsed.scheme != nil {
            url = parsed
        } else {
            throw invalidArgument("Sharing url must be absolute")
        }
        return Payload(text: text, url: url, subject: subject)
    }

    private func presentationController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
            ?? scenes.flatMap(\.windows).first(where: { !$0.isHidden })
        guard let root = window?.rootViewController else { return nil }
        return topController(root)
    }

    private func topController(_ controller: UIViewController) -> UIViewController {
        if let presented = controller.presentedViewController {
            return topController(presented)
        }
        if let navigation = controller as? UINavigationController,
           let visible = navigation.visibleViewController {
            return topController(visible)
        }
        if let tabs = controller as? UITabBarController,
           let selected = tabs.selectedViewController {
            return topController(selected)
        }
        return controller
    }

    private func invalidArgument(_ message: String) -> StingNativeModuleError {
        StingNativeModuleError(code: "E_INVALID_ARGUMENT", message: message)
    }
}
