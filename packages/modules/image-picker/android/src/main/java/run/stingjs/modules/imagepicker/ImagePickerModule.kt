package run.stingjs.modules.imagepicker

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult

class ImagePickerModule(context: Context) : StingNativeModule {
    override val name = "ImagePicker"
    override val version = "0.1.0"

    private val appContext = context.applicationContext

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        throw StingNativeModuleError(
            code = "E_SYNC_UNSUPPORTED",
            message = "ImagePicker methods are asynchronous",
        )
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        if (method != "pickImage") {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_METHOD_NOT_FOUND",
                        message = "ImagePicker does not implement asynchronous method $method",
                    ),
                ),
            )
            return
        }
        ImagePickerCoordinator.begin(appContext, completion)
    }
}

class StingImagePickerActivity : Activity() {
    private var launched = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) launchPicker()
    }

    private fun launchPicker() {
        if (launched) return
        launched = true
        val intent = if (Build.VERSION.SDK_INT >= 33) {
            Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*"
            }
        } else {
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/*"
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        try {
            startActivityForResult(intent, REQUEST_PICK_IMAGE)
        } catch (error: ActivityNotFoundException) {
            ImagePickerCoordinator.fail(
                StingNativeModuleError(
                    code = "E_IMAGE_PICKER_UNAVAILABLE",
                    message = "No system image picker is available",
                ),
            )
            finish()
        }
    }

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_PICK_IMAGE) {
            ImagePickerCoordinator.finish(this, resultCode, data?.data)
            finish()
        }
    }

    companion object {
        private const val REQUEST_PICK_IMAGE = 9017
    }
}

private object ImagePickerCoordinator {
    private val lock = Any()
    private var completion: StingNativeModuleCompletion? = null

    fun begin(context: Context, next: StingNativeModuleCompletion) {
        synchronized(lock) {
            if (completion != null) {
                next(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_IMAGE_PICKER_BUSY",
                            message = "ImagePicker already has an active request",
                        ),
                    ),
                )
                return
            }
            completion = next
        }

        try {
            context.startActivity(
                Intent(context, StingImagePickerActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        } catch (error: Throwable) {
            takeCompletion()?.invoke(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_IMAGE_PICKER_UNAVAILABLE",
                        message = error.message ?: "Unable to start the system image picker",
                    ),
                ),
            )
        }
    }

    fun fail(error: StingNativeModuleError) {
        takeCompletion()?.invoke(StingNativeModuleResult.Failure(error))
    }

    fun finish(activity: Activity, resultCode: Int, uri: Uri?) {
        val callback = takeCompletion() ?: return
        if (resultCode != Activity.RESULT_OK || uri == null) {
            callback(
                StingNativeModuleResult.Success(
                    mapOf("canceled" to true, "asset" to null),
                ),
            )
            return
        }

        try {
            callback(
                StingNativeModuleResult.Success(
                    mapOf(
                        "canceled" to false,
                        "asset" to copyAsset(activity, uri),
                    ),
                ),
            )
        } catch (error: StingNativeModuleError) {
            callback(StingNativeModuleResult.Failure(error))
        } catch (error: Throwable) {
            callback(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_IMAGE_PICKER_READ",
                        message = error.message ?: "Unable to read the selected image",
                    ),
                ),
            )
        }
    }

    private fun takeCompletion(): StingNativeModuleCompletion? = synchronized(lock) {
        completion.also { completion = null }
    }

    private fun copyAsset(context: Context, uri: Uri): Map<String, Any> {
        val resolver = context.contentResolver
        val mimeType = resolver.getType(uri) ?: "image/*"
        val displayName = resolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

        val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
            ?: displayName?.substringAfterLast('.', missingDelimiterValue = "img")
            ?: "img"
        val directory = File(context.cacheDir, "sting-image-picker").apply { mkdirs() }
        val destination = File(directory, "${UUID.randomUUID()}.$extension")

        resolver.openInputStream(uri)?.use { input ->
            FileOutputStream(destination).use { output -> input.copyTo(output) }
        } ?: throw StingNativeModuleError(
            code = "E_IMAGE_PICKER_READ",
            message = "The selected image did not provide a readable stream",
        )

        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(destination.absolutePath, options)
        return buildMap {
            put("uri", Uri.fromFile(destination).toString())
            put("fileName", displayName ?: destination.name)
            put("mimeType", mimeType)
            if (options.outWidth > 0) put("width", options.outWidth)
            if (options.outHeight > 0) put("height", options.outHeight)
        }
    }
}
