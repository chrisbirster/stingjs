package run.stingjs.modules.notifications

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import run.stingjs.runtime.StingApplicationLifecycleEvent
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingPermissionCompletion
import run.stingjs.runtime.StingPermissionStatus
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class NotificationsModule(private val context: Context) : StingNativeModule {
    override val name = "Notifications"
    override val version = "0.1.0"
    private val owner = UUID.randomUUID().toString()
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences("sting.notifications", Context.MODE_PRIVATE)

    init { ensureChannel(context) }

    override fun callSync(method: String, arguments: List<Any?>): Any? = throw StingNativeModuleError("E_METHOD_NOT_FOUND", "Notifications does not implement synchronous method $method")
    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        when (method) {
            "schedule" -> {
                val id = (arguments.getOrNull(0) as? String)?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
                val title = arguments.getOrNull(1) as? String ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_INVALID_ARGUMENT", "Notifications.schedule requires a title."))); return }
                val body = arguments.getOrNull(2) as? String ?: ""
                val at = (arguments.getOrNull(3) as? Number)?.toLong()?.takeIf { it > 0 } ?: System.currentTimeMillis()
                val intent = alarmIntent(context, id, title, body)
                alarms.set(AlarmManager.RTC_WAKEUP, at, intent)
                prefs.edit().putString(id, "$at\n$title\n$body").apply()
                completion(StingNativeModuleResult.Success(id))
            }
            "getScheduled" -> {
                val values = prefs.all.mapNotNull { (id, raw) ->
                    val parts = (raw as? String)?.split('\n', limit = 3) ?: return@mapNotNull null
                    mapOf("id" to id, "at" to (parts.getOrNull(0)?.toDoubleOrNull()), "title" to parts.getOrNull(1).orEmpty(), "body" to parts.getOrNull(2).orEmpty())
                }
                completion(StingNativeModuleResult.Success(values))
            }
            "cancel" -> {
                val id = arguments.firstOrNull() as? String ?: run { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_INVALID_ARGUMENT", "Notifications.cancel requires an id."))); return }
                alarms.cancel(alarmIntent(context, id, "", "")); prefs.edit().remove(id).apply(); completion(StingNativeModuleResult.Success(null))
            }
            else -> completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_METHOD_NOT_FOUND", "Notifications does not implement asynchronous method $method")))
        }
    }

    override fun setEventEnabled(event: String, enabled: Boolean, emit: StingNativeModuleEventEmitter) {
        if (event != "received" && event != "opened") throw StingNativeModuleError("E_EVENT_NOT_FOUND", "Notifications does not implement event $event")
        if (enabled) NotificationEvents.set(event, owner, emit) else NotificationEvents.remove(event, owner)
    }

    override fun onApplicationLifecycle(event: StingApplicationLifecycleEvent) {
        if (event != StingApplicationLifecycleEvent.RUNTIME_DISPOSING) return
        NotificationEvents.clear(owner)
        NotificationsPermissionActivity.cancel(owner)
    }

    override fun permissionStatus(permission: String): StingPermissionStatus {
        if (permission != "notifications") throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Notifications does not implement permission $permission")
        if (Build.VERSION.SDK_INT < 33) return StingPermissionStatus.GRANTED
        return if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) StingPermissionStatus.GRANTED else StingPermissionStatus.UNDETERMINED
    }
    override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
        if (permission != "notifications") { completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Notifications does not implement permission $permission"))); return }
        if (Build.VERSION.SDK_INT < 33 || permissionStatus(permission) == StingPermissionStatus.GRANTED) { completion(Result.success(StingPermissionStatus.GRANTED)); return }
        NotificationsPermissionActivity.request(context, owner) { completion(Result.success(permissionStatus(permission))) }
    }

    companion object {
        const val CHANNEL_ID = "sting-default"
        fun ensureChannel(context: Context) { if (Build.VERSION.SDK_INT >= 26) (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Sting", NotificationManager.IMPORTANCE_DEFAULT)) }
        fun alarmIntent(context: Context, id: String, title: String, body: String): PendingIntent {
            val intent = Intent(context, NotificationAlarmReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("body", body)
            return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}

private data class OwnedEmitter(val owner: String, val emit: StingNativeModuleEventEmitter)

private object NotificationEvents {
    private val emitters = ConcurrentHashMap<String, OwnedEmitter>()
    fun set(event: String, owner: String, emit: StingNativeModuleEventEmitter) { emitters[event] = OwnedEmitter(owner, emit) }
    fun remove(event: String, owner: String) { emitters[event]?.takeIf { it.owner == owner }?.let { emitters.remove(event, it) } }
    fun clear(owner: String) { emitters.entries.filter { it.value.owner == owner }.forEach { emitters.remove(it.key, it.value) } }
    fun emit(event: String, payload: Map<String, Any?>) { emitters[event]?.emit?.invoke(payload) }
}

class NotificationAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: ""
        val body = intent.getStringExtra("body") ?: ""
        NotificationsModule.ensureChannel(context)
        val opened = PendingIntent.getBroadcast(context, id.hashCode(), Intent(context, NotificationOpenedReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("body", body), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(context, NotificationsModule.CHANNEL_ID) else @Suppress("DEPRECATION") android.app.Notification.Builder(context)
        notification.setContentTitle(title).setContentText(body).setSmallIcon(android.R.drawable.ic_dialog_info).setContentIntent(opened).setAutoCancel(true)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id.hashCode(), notification.build())
        context.getSharedPreferences("sting.notifications", Context.MODE_PRIVATE).edit().remove(id).apply()
        NotificationEvents.emit("received", mapOf("id" to id, "title" to title, "body" to body))
    }
}

class NotificationOpenedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        NotificationEvents.emit("opened", mapOf("id" to id, "title" to (intent.getStringExtra("title") ?: ""), "body" to (intent.getStringExtra("body") ?: "")))
    }
}

class NotificationsPermissionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if (savedInstanceState == null && Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_CODE) else if (Build.VERSION.SDK_INT < 33) { completeAll(); finish() } }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); if (requestCode == REQUEST_CODE) { completeAll(); finish() } }
    companion object {
        private const val REQUEST_CODE = 9045
        private val lock = Any()
        private val callbacks = linkedMapOf<String, () -> Unit>()
        private var active = false
        fun request(context: Context, owner: String, completion: () -> Unit) {
            val shouldLaunch = synchronized(lock) {
                callbacks[owner] = completion
                if (active) false else { active = true; true }
            }
            if (shouldLaunch) context.startActivity(Intent(context, NotificationsPermissionActivity::class.java).apply { if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
        }
        fun cancel(owner: String) { synchronized(lock) { callbacks.remove(owner) } }
        private fun completeAll() {
            val pending = synchronized(lock) {
                active = false
                val values = callbacks.values.toList()
                callbacks.clear()
                values
            }
            pending.forEach { it() }
        }
    }
}
