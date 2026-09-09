package run.stingjs.modules.location

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import run.stingjs.runtime.StingApplicationLifecycleEvent
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingPermissionCompletion
import run.stingjs.runtime.StingPermissionStatus
import java.util.UUID

class LocationModule(private val context: Context) : StingNativeModule, LocationListener {
    override val name = "Location"
    override val version = "0.1.0"
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val permissionOwner = UUID.randomUUID().toString()
    private var emitter: StingNativeModuleEventEmitter? = null
    private var pendingPosition: StingNativeModuleCompletion? = null
    private var observing = false

    override fun callSync(method: String, arguments: List<Any?>): Any? = when (method) {
        "isAvailable" -> manager.allProviders.isNotEmpty()
        else -> throw StingNativeModuleError("E_METHOD_NOT_FOUND", "Location does not implement synchronous method $method")
    }

    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        if (method != "getCurrentPosition") {
            completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_METHOD_NOT_FOUND", "Location does not implement asynchronous method $method")))
            return
        }
        if (!hasForegroundPermission()) {
            completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_LOCATION_PERMISSION", "Foreground location permission is required.")))
            return
        }
        pendingPosition = completion
        try {
            val last = enabledProviders().mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }.maxByOrNull { it.time }
            if (last != null) {
                pendingPosition = null
                completion(StingNativeModuleResult.Success(payload(last)))
                return
            }
            val provider = enabledProviders().firstOrNull() ?: throw StingNativeModuleError("E_LOCATION_UNAVAILABLE", "No location provider is enabled.")
            @Suppress("DEPRECATION") manager.requestSingleUpdate(provider, this, Looper.getMainLooper())
        } catch (error: Throwable) {
            pendingPosition = null
            completion(StingNativeModuleResult.Failure(error))
        }
    }

    override fun setEventEnabled(event: String, enabled: Boolean, emit: StingNativeModuleEventEmitter) {
        if (event != "change") throw StingNativeModuleError("E_EVENT_NOT_FOUND", "Location does not implement event $event")
        if (enabled) {
            if (!hasForegroundPermission()) throw StingNativeModuleError("E_LOCATION_PERMISSION", "Foreground location permission is required.")
            emitter = emit
            observing = true
            startUpdates()
        } else {
            observing = false
            emitter = null
            manager.removeUpdates(this)
        }
    }

    override fun permissionStatus(permission: String): StingPermissionStatus {
        if (permission != "foreground") throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Location does not implement permission $permission")
        val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return when { fine -> StingPermissionStatus.GRANTED; coarse -> StingPermissionStatus.LIMITED; else -> StingPermissionStatus.UNDETERMINED }
    }

    override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
        if (permission != "foreground") { completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Location does not implement permission $permission"))); return }
        val current = permissionStatus(permission)
        if (current == StingPermissionStatus.GRANTED || current == StingPermissionStatus.LIMITED) { completion(Result.success(current)); return }
        LocationPermissionActivity.request(context, permissionOwner) { completion(Result.success(permissionStatus(permission))) }
    }

    override fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {
        when (event) {
            StingApplicationLifecycleEvent.BACKGROUND -> manager.removeUpdates(this)
            StingApplicationLifecycleEvent.ACTIVE -> if (observing && hasForegroundPermission()) startUpdates()
            StingApplicationLifecycleEvent.RUNTIME_DISPOSING -> {
                manager.removeUpdates(this)
                observing = false
                emitter = null
                LocationPermissionActivity.cancel(permissionOwner)
                pendingPosition?.invoke(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError("E_RUNTIME_DISPOSED", "Sting runtime is already disposing"),
                    ),
                )
                pendingPosition = null
            }
            else -> Unit
        }
    }

    override fun onLocationChanged(location: Location) {
        pendingPosition?.let { completion -> pendingPosition = null; completion(StingNativeModuleResult.Success(payload(location))) }
        emitter?.invoke(payload(location))
    }

    @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit

    private fun hasForegroundPermission(): Boolean = permissionStatus("foreground") in setOf(StingPermissionStatus.GRANTED, StingPermissionStatus.LIMITED)
    private fun enabledProviders(): List<String> = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
    private fun startUpdates() { enabledProviders().forEach { provider -> runCatching { manager.requestLocationUpdates(provider, 1000L, 0f, this, Looper.getMainLooper()) } } }
    private fun payload(location: Location): Map<String, Any?> = mapOf(
        "coords" to mapOf(
            "latitude" to location.latitude,
            "longitude" to location.longitude,
            "altitude" to if (location.hasAltitude()) location.altitude else null,
            "accuracy" to location.accuracy.toDouble(),
            "altitudeAccuracy" to null,
            "heading" to if (location.hasBearing()) location.bearing.toDouble() else null,
            "speed" to if (location.hasSpeed()) location.speed.toDouble() else null,
        ),
        "timestamp" to location.time.toDouble(),
    )
}

class LocationPermissionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQUEST_CODE)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CODE) { completeAll(); finish() }
    }
    companion object {
        private const val REQUEST_CODE = 9041
        private val lock = Any()
        private val callbacks = linkedMapOf<String, () -> Unit>()
        private var active = false

        fun request(context: Context, owner: String, completion: () -> Unit) {
            val shouldLaunch = synchronized(lock) {
                callbacks[owner] = completion
                if (active) false else { active = true; true }
            }
            if (shouldLaunch) {
                context.startActivity(Intent(context, LocationPermissionActivity::class.java).apply { if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
            }
        }

        fun cancel(owner: String) {
            synchronized(lock) { callbacks.remove(owner) }
        }

        private fun completeAll() {
            val values = synchronized(lock) {
                active = false
                val pending = callbacks.values.toList()
                callbacks.clear()
                pending
            }
            values.forEach { it() }
        }
    }
}
