import AVFoundation
import Foundation
import StingRuntime
import UIKit

public final class CameraModule: StingNativeModule {
    public let name = "Camera"
    public let version = "0.1.0"
    private weak var activePreview: CameraPreviewNativeView?

    public init() {}

    public func callSync(method: String, arguments: [Any]) throws -> Any? {
        throw StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Camera does not implement synchronous method \(method)")
    }

    public func callAsync(method: String, arguments: [Any], completion: @escaping StingNativeModuleCompletion) {
        guard method == "capturePhoto" else { completion(.failure(StingNativeModuleError(code: "E_METHOD_NOT_FOUND", message: "Camera does not implement asynchronous method \(method)"))); return }
        guard let activePreview else { completion(.failure(StingNativeModuleError(code: "E_CAMERA_PREVIEW_REQUIRED", message: "Attach a CameraView before capturing a photo."))); return }
        activePreview.capture(completion: completion)
    }

    public func createView(type: String) throws -> any StingNativeView {
        guard type == "Preview" else { throw StingNativeModuleError(code: "E_VIEW_TYPE_NOT_FOUND", message: "Camera does not implement view \(type)") }
        return CameraPreviewNativeView(module: self)
    }

    public func permissionStatus(for permission: String) throws -> StingPermissionStatus {
        guard permission == "camera" else { throw StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Camera does not implement permission \(permission)") }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined: return .undetermined
        case .restricted: return .restricted
        case .denied: return .denied
        case .authorized: return .granted
        @unknown default: return .denied
        }
    }

    public func requestPermission(_ permission: String, completion: @escaping StingPermissionCompletion) {
        guard permission == "camera" else { completion(.failure(StingNativeModuleError(code: "E_PERMISSION_NOT_FOUND", message: "Camera does not implement permission \(permission)"))); return }
        let current = (try? permissionStatus(for: permission)) ?? .denied
        guard current == .undetermined else { completion(.success(current)); return }
        AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in completion(.success((try? self?.permissionStatus(for: permission)) ?? .denied)) }
    }

    fileprivate func activate(_ preview: CameraPreviewNativeView) { activePreview = preview }
    fileprivate func deactivate(_ preview: CameraPreviewNativeView) { if activePreview === preview { activePreview = nil } }
}

private final class PreviewContainerView: UIView {
    let previewLayer = AVCaptureVideoPreviewLayer()
    override init(frame: CGRect) { super.init(frame: frame); previewLayer.videoGravity = .resizeAspectFill; layer.addSublayer(previewLayer) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layoutSubviews() { super.layoutSubviews(); previewLayer.frame = bounds }
}

private final class CameraPreviewNativeView: NSObject, StingNativeView, AVCapturePhotoCaptureDelegate {
    let container = PreviewContainerView()
    var view: UIView { container }
    private weak var module: CameraModule?
    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var facing: AVCaptureDevice.Position = .back
    private var captureCompletion: StingNativeModuleCompletion?
    private var attached = false

    init(module: CameraModule) {
        self.module = module
        super.init()
        container.previewLayer.session = session
    }

    func setProperty(name: String, value: Any) throws {
        guard name == "facing", let raw = value as? String, raw == "front" || raw == "back" else { throw StingNativeModuleError(code: "E_VIEW_PROPERTY_NOT_FOUND", message: "Camera Preview supports facing=front|back") }
        facing = raw == "front" ? .front : .back
        if attached { configureAndStart() }
    }

    func didAttach() { attached = true; module?.activate(self); configureAndStart() }
    func didDetach() { attached = false; module?.deactivate(self); session.stopRunning() }
    func dispose() { didDetach(); captureCompletion = nil }

    func capture(completion: @escaping StingNativeModuleCompletion) {
        guard attached, session.isRunning else { completion(.failure(StingNativeModuleError(code: "E_CAMERA_NOT_READY", message: "Camera preview is not ready."))); return }
        guard captureCompletion == nil else { completion(.failure(StingNativeModuleError(code: "E_CAMERA_BUSY", message: "A camera capture is already active."))); return }
        captureCompletion = completion
        output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let completion = captureCompletion
        captureCompletion = nil
        if let error { completion?(.failure(StingNativeModuleError(code: "E_CAMERA_CAPTURE", message: error.localizedDescription))); return }
        guard let data = photo.fileDataRepresentation() else { completion?(.failure(StingNativeModuleError(code: "E_CAMERA_CAPTURE", message: "Camera did not produce JPEG data."))); return }
        do {
            let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let url = directory.appendingPathComponent("sting-camera-\(UUID().uuidString).jpg")
            try data.write(to: url, options: .atomic)
            let dimensions = photo.resolvedSettings.photoDimensions
            completion?(.success(["uri": url.absoluteString, "width": Int(dimensions.width), "height": Int(dimensions.height), "mimeType": "image/jpeg"]))
        } catch { completion?(.failure(StingNativeModuleError(code: "E_CAMERA_CAPTURE", message: error.localizedDescription))) }
    }

    private func configureAndStart() {
        guard (try? module?.permissionStatus(for: "camera")) == .granted else { return }
        session.beginConfiguration()
        session.inputs.forEach(session.removeInput)
        if !session.outputs.contains(output), session.canAddOutput(output) { session.addOutput(output) }
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: facing), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) { session.addInput(input) }
        session.commitConfiguration()
        if !session.isRunning { session.startRunning() }
    }
}
