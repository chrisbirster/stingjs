import Foundation
import ImageIO
import PhotosUI
import StingRuntime
import UIKit
import UniformTypeIdentifiers

public final class ImagePickerModule: NSObject, StingNativeModule, PHPickerViewControllerDelegate {
    public let name = "ImagePicker"
    public let version = "0.1.0"

    private var pendingCompletion: StingNativeModuleCompletion?
    private weak var activePicker: PHPickerViewController?

    public override init() {
        super.init()
    }

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(
            code: "E_SYNC_UNSUPPORTED",
            message: "ImagePicker methods are asynchronous"
        )
    }

    public func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        guard method == "pickImage" else {
            completion(.failure(StingNativeModuleError(
                code: "E_METHOD_NOT_FOUND",
                message: "ImagePicker does not implement asynchronous method \(method)"
            )))
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_UNAVAILABLE",
                    message: "ImagePicker was released before presentation"
                )))
                return
            }
            guard self.pendingCompletion == nil else {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_BUSY",
                    message: "ImagePicker already has an active request"
                )))
                return
            }
            guard let presenter = self.presentationController() else {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_UNAVAILABLE",
                    message: "ImagePicker has no active native presentation context"
                )))
                return
            }

            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.filter = .images
            configuration.selectionLimit = 1
            configuration.preferredAssetRepresentationMode = .current

            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingCompletion = completion
            self.activePicker = picker
            presenter.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let completion = takeCompletion() else { return }
        guard let result = results.first else {
            completion(.success(["canceled": true, "asset": NSNull()]))
            return
        }

        let provider = result.itemProvider
        let typeIdentifier = provider.registeredTypeIdentifiers.first(where: { identifier in
            UTType(identifier)?.conforms(to: .image) == true
        }) ?? UTType.image.identifier

        provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] sourceURL, error in
            if let error {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_READ",
                    message: error.localizedDescription
                )))
                return
            }
            guard let self, let sourceURL else {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_READ",
                    message: "The selected image did not provide a readable file"
                )))
                return
            }

            do {
                let asset = try self.copyAsset(
                    sourceURL: sourceURL,
                    suggestedName: provider.suggestedName,
                    typeIdentifier: typeIdentifier
                )
                completion(.success(["canceled": false, "asset": asset]))
            } catch let error as StingNativeModuleError {
                completion(.failure(error))
            } catch {
                completion(.failure(StingNativeModuleError(
                    code: "E_IMAGE_PICKER_READ",
                    message: error.localizedDescription
                )))
            }
        }
    }

    private func takeCompletion() -> StingNativeModuleCompletion? {
        precondition(Thread.isMainThread)
        let completion = pendingCompletion
        pendingCompletion = nil
        activePicker = nil
        return completion
    }

    private func copyAsset(
        sourceURL: URL,
        suggestedName: String?,
        typeIdentifier: String
    ) throws -> [String: Any] {
        let fileManager = FileManager.default
        let directory = fileManager.temporaryDirectory
            .appendingPathComponent("sting-image-picker", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        let type = UTType(typeIdentifier)
        let sourceExtension = sourceURL.pathExtension
        let fileExtension = !sourceExtension.isEmpty
            ? sourceExtension
            : (type?.preferredFilenameExtension ?? "img")
        let destination = directory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(fileExtension)
        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: destination)
        }
        try fileManager.copyItem(at: sourceURL, to: destination)

        let originalName = suggestedName?.isEmpty == false
            ? suggestedName!
            : destination.lastPathComponent
        var asset: [String: Any] = [
            "uri": destination.absoluteString,
            "fileName": originalName,
            "mimeType": type?.preferredMIMEType ?? "image/*",
        ]

        if let source = CGImageSourceCreateWithURL(destination as CFURL, nil),
           let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] {
            if let width = properties[kCGImagePropertyPixelWidth] as? NSNumber {
                asset["width"] = width.intValue
            }
            if let height = properties[kCGImagePropertyPixelHeight] as? NSNumber {
                asset["height"] = height.intValue
            }
        }
        return asset
    }

    private func presentationController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
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
}
