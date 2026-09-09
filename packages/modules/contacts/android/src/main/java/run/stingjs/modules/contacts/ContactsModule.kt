package run.stingjs.modules.contacts

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.ContactsContract
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult
import run.stingjs.runtime.StingPermissionCompletion
import run.stingjs.runtime.StingPermissionStatus
import java.util.concurrent.atomic.AtomicReference

class ContactsModule(private val context: Context) : StingNativeModule {
    override val name = "Contacts"
    override val version = "0.1.0"

    override fun callSync(method: String, arguments: List<Any?>): Any? = throw StingNativeModuleError("E_METHOD_NOT_FOUND", "Contacts does not implement synchronous method $method")

    override fun callAsync(method: String, arguments: List<Any?>, completion: StingNativeModuleCompletion) {
        if (!authorized()) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CONTACTS_PERMISSION", "Contacts permission is required."))); return }
        when (method) {
            "getContacts" -> {
                val limit = ((arguments.firstOrNull() as? Number)?.toInt() ?: 100).coerceIn(1, 1000)
                try { completion(StingNativeModuleResult.Success(readContacts(limit))) }
                catch (error: Throwable) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CONTACTS", error.message ?: "Unable to read contacts."))) }
            }
            "pickContact" -> ContactsPickerActivity.pick(context) { uri ->
                try { completion(StingNativeModuleResult.Success(uri?.let { readOne(it) })) }
                catch (error: Throwable) { completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_CONTACTS", error.message ?: "Unable to read contact."))) }
            }
            else -> completion(StingNativeModuleResult.Failure(StingNativeModuleError("E_METHOD_NOT_FOUND", "Contacts does not implement asynchronous method $method")))
        }
    }

    override fun permissionStatus(permission: String): StingPermissionStatus {
        if (permission != "contacts") throw StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Contacts does not implement permission $permission")
        return if (authorized()) StingPermissionStatus.GRANTED else StingPermissionStatus.UNDETERMINED
    }

    override fun requestPermission(permission: String, completion: StingPermissionCompletion) {
        if (permission != "contacts") { completion(Result.failure(StingNativeModuleError("E_PERMISSION_NOT_FOUND", "Contacts does not implement permission $permission"))); return }
        if (authorized()) { completion(Result.success(StingPermissionStatus.GRANTED)); return }
        ContactsPermissionActivity.request(context) { completion(Result.success(permissionStatus(permission))) }
    }

    private fun authorized(): Boolean = context.checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

    private fun readContacts(limit: Int): List<Map<String, Any?>> {
        val ids = mutableListOf<Pair<String, String>>()
        context.contentResolver.query(ContactsContract.Contacts.CONTENT_URI, arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY), null, null, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY + " COLLATE NOCASE ASC")?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
            val nameIndex = cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
            while (cursor.moveToNext() && ids.size < limit) ids += cursor.getString(idIndex) to (cursor.getString(nameIndex) ?: "")
        }
        return ids.map { (id, displayName) -> contactPayload(id, displayName) }
    }

    private fun readOne(uri: Uri): Map<String, Any?>? {
        var id: String? = null
        var displayName = ""
        context.contentResolver.query(uri, arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) { id = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID)); displayName = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)) ?: "" }
        }
        return id?.let { contactPayload(it, displayName) }
    }

    private fun contactPayload(id: String, displayName: String): Map<String, Any?> {
        val phones = mutableListOf<String>()
        context.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER), ContactsContract.CommonDataKinds.Phone.CONTACT_ID + "=?", arrayOf(id), null)?.use { cursor ->
            val index = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (cursor.moveToNext()) cursor.getString(index)?.let(phones::add)
        }
        val emails = mutableListOf<String>()
        context.contentResolver.query(ContactsContract.CommonDataKinds.Email.CONTENT_URI, arrayOf(ContactsContract.CommonDataKinds.Email.ADDRESS), ContactsContract.CommonDataKinds.Email.CONTACT_ID + "=?", arrayOf(id), null)?.use { cursor ->
            val index = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
            while (cursor.moveToNext()) cursor.getString(index)?.let(emails::add)
        }
        val parts = displayName.trim().split(Regex("\\s+"), limit = 2)
        return mapOf("id" to id, "givenName" to parts.firstOrNull().orEmpty(), "familyName" to parts.getOrNull(1).orEmpty(), "displayName" to displayName, "phones" to phones, "emails" to emails)
    }
}

class ContactsPermissionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if (savedInstanceState == null) requestPermissions(arrayOf(Manifest.permission.READ_CONTACTS), REQUEST_CODE) }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) { super.onRequestPermissionsResult(requestCode, permissions, grantResults); if (requestCode == REQUEST_CODE) { callback.getAndSet(null)?.invoke(); finish() } }
    companion object {
        private const val REQUEST_CODE = 9042
        private val callback = AtomicReference<(() -> Unit)?>(null)
        fun request(context: Context, completion: () -> Unit) { if (!callback.compareAndSet(null, completion)) { completion(); return }; context.startActivity(Intent(context, ContactsPermissionActivity::class.java).apply { if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }) }
    }
}

class ContactsPickerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if (savedInstanceState == null) startActivityForResult(Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI), REQUEST_CODE) }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) { super.onActivityResult(requestCode, resultCode, data); if (requestCode == REQUEST_CODE) { callback.getAndSet(null)?.invoke(if (resultCode == RESULT_OK) data?.data else null); finish() } }
    companion object {
        private const val REQUEST_CODE = 9043
        private val callback = AtomicReference<((Uri?) -> Unit)?>(null)
        fun pick(context: Context, completion: (Uri?) -> Unit) { if (!callback.compareAndSet(null, completion)) { completion(null); return }; context.startActivity(Intent(context, ContactsPickerActivity::class.java).apply { if (context !is Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }) }
    }
}
