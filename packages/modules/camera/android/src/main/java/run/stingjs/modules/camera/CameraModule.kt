package run.stingjs.modules.camera

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.os.Bundle
import android.view.TextureView
import android.view.View
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingNativeView
import run.stingjs.runtime.StingPermissionCompletion
import run.stingjs.runtime.StingPermissionStatus
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

@Suppress("DEPRECATION")
class CameraModule(private val context: Context) : StingNativeModule {
    override val name = "Camera"
    override val version = "0.1.0"
    private var activePreview: CameraPreviewNativeView? = null

    override fun callSync(method: String, arguments: List<Any?>): Any? = throw StingNativeModuleError("E_METHOD_NOT_FOUND", "Camera does not implement synchronous method $method")
    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        if (method != "capturePhoto") { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_METHOD_NOT_FOUND", "Camera does not implement asynchronous method $method"))); return }
        activePreview?.capture(completion) ?: completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CAMERA_PREVIEW_REQUIRED", "Attach a CameraView before capturing a photo.")))
    }
    override fun createView(type: String, context: Context): StingNativeView {
        if (type != "Preview") throw StingNativeModuleError("E_VIEW_TYPE_NOT_FOUND", "Camera does not implement view $type")
        return CameraPreviewNativeView(context, this)
    }
    override fun permissionStatus(permission: String): StingPermissionStatus {
        if (permission != "camera") throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Camera does not implement permission $permission")
        return if (context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) StingPermissionStatus.GRANTED else StingPermissionStatus.UNDETERMINED
    }
    override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
        if (permission != "camera") { completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Camera does not implement permission $permission"))); return }
        if (permissionStatus(permission) == StingPermissionStatus.GRANTED) { completion(Result.success(StingPermissionStatus.GRANTED)); return }
        CameraPermissionActivity.request(context) { completion(Result.success(permissionStatus(permission))) }
    }
    internal fun activate(preview: CameraPreviewNativeView) { activePreview = preview }
    internal fun deactivate(preview: CameraPreviewNativeView) { if (activePreview === preview) activePreview = null }
}

@Suppress("DEPRECATION")
internal class CameraPreviewNativeView(context: Context, private val module: CameraModule) : StingNativeView, TextureView.SurfaceTextureListener {
    private val texture = TextureView(context)
    override val view: View get() = texture
    private var camera: Camera? = null
    private var facing = Camera.CameraInfo.CAMERA_FACING_BACK
    private var attached = false
    private var captureCompletion: StingNativeModuleCompletion? = null

    init { texture.surfaceTextureListener = this }
    override fun setProperty(name: String, value: Any?) {
        if (name != "facing" || value !is String || (value != "front" && value != "back")) throw StingNativeModuleError("E_VIEW_PROPERTY_NOT_FOUND", "Camera Preview supports facing=front|back")
        facing = if (value == "front") Camera.CameraInfo.CAMERA_FACING_FRONT else Camera.CameraInfo.CAMERA_FACING_BACK
        if (attached && texture.isAvailable) openCamera(texture.surfaceTexture)
    }
    override fun didAttach() { attached = true; module.activate(this); if (texture.isAvailable) openCamera(texture.surfaceTexture) }
    override fun didDetach() { attached = false; module.deactivate(this); releaseCamera() }
    override fun dispose() { didDetach(); captureCompletion = null }

    fun capture(completion: StingNativeModuleCompletion) {
        val active = camera ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CAMERA_NOT_READY", "Camera preview is not ready."))); return }
        if (captureCompletion != null) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CAMERA_BUSY", "A camera capture is already active."))); return }
        captureCompletion = completion
        active.takePicture(null, null) { data, instance ->
            val callback = captureCompletion
            captureCompletion = null
            try {
                val file = File(texture.context.cacheDir, "sting-camera-${UUID.randomUUID()}.jpg")
                file.writeBytes(data)
                val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(data, 0, data.size, options)
                callback?.invoke(StingNativeModuleResult.Success(mapOf("uri" to file.toURI().toString(), "width" to options.outWidth, "height" to options.outHeight, "mimeType" to "image/jpeg")))
            } catch (error: Throwable) {
                callback?.invoke(StingNativeModuleResult.Failure(StingNativeModuleError("E_CAMERA_CAPTURE", error.message ?: "Unable to save camera photo.")))
            } finally { runCatching { instance.startPreview() } }
        }
    }

    override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) { if (attached) openCamera(surface) }
    override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) = Unit
    override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean { releaseCamera(); return true }
    override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit

    private fun openCamera(surface: SurfaceTexture?) {
        if (surface == null || module.permissionStatus("camera") != StingPermissionStatus.GRANTED) return
        releaseCamera()
        try {
            val id = cameraIdForFacing(facing)
            camera = Camera.open(id).also { it.setPreviewTexture(surface); it.startPreview() }
        } catch (_: Throwable) { releaseCamera() }
    }
    private fun cameraIdForFacing(target: Int): Int {
        val info = Camera.CameraInfo()
        for (id in 0 until Camera.getNumberOfCameras()) { Camera.getCameraInfo(id, info); if (info.facing == target) return id }
        return 0
    }
    private fun releaseCamera() { runCatching { camera?.stopPreview() }; runCatching { camera?.release() }; camera = null }
}

class CameraPermissionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if (savedInstanceState == null) requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CODE) }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); if (requestCode == REQUEST_CODE) { callback.getAndSet(null)?.invoke(); finish() } }
    companion object {
        private const val REQUEST_CODE = 9044
        private val callback = AtomicReference<(() -> Unit)?>(null)
        fun request(context: Context, completion: () -> Unit) { if (!callback.compareAndSet(null, completion)) { completion(); return }; context.startActivity(Intent(context, CameraPermissionActivity::class.java).apply { if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }) }
    }
}
