package run.stingjs.modules.securestore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleResult

class SecureStoreModule(context: Context) : StingNativeModule {
    override val name = "SecureStore"
    override val version = "0.1.0"

    private val preferences = context.applicationContext.getSharedPreferences(
        "sting-secure-store",
        Context.MODE_PRIVATE,
    )
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "StingSecureStore").apply { isDaemon = true }
    }

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        throw StingNativeModuleError(
            code = "E_SYNC_UNSUPPORTED",
            message = "SecureStore methods are asynchronous",
        )
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        executor.execute {
            try {
                completion(StingNativeModuleResult.Success(perform(method, arguments)))
            } catch (error: StingNativeModuleError) {
                completion(StingNativeModuleResult.Failure(error))
            } catch (error: Throwable) {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_SECURE_STORE",
                            message = error.message ?: "SecureStore operation failed",
                            details = mapOf("method" to method),
                        ),
                    ),
                )
            }
        }
    }

    private fun perform(method: String, arguments: List<Any?>): Any? = when (method) {
        "getItem" -> {
            val key = storageKey(arguments)
            preferences.getString(key, null)?.let(::decrypt)
        }
        "setItem" -> {
            val key = storageKey(arguments, namespaceIndex = 2)
            val value = arguments.getOrNull(1) as? String
                ?: throw invalidArgument("SecureStore.setItem requires a string value")
            if (value.isEmpty()) throw invalidArgument("SecureStore.setItem requires a non-empty string value")
            if (!preferences.edit().putString(key, encrypt(value)).commit()) {
                throw StingNativeModuleError(
                    code = "E_SECURE_STORE",
                    message = "SecureStore failed to persist value",
                )
            }
            null
        }
        "deleteItem" -> {
            val key = storageKey(arguments)
            if (!preferences.edit().remove(key).commit()) {
                throw StingNativeModuleError(
                    code = "E_SECURE_STORE",
                    message = "SecureStore failed to delete value",
                )
            }
            null
        }
        "hasItem" -> preferences.contains(storageKey(arguments))
        else -> throw StingNativeModuleError(
            code = "E_METHOD_NOT_FOUND",
            message = "SecureStore does not implement asynchronous method $method",
        )
    }

    private fun storageKey(arguments: List<Any?>, namespaceIndex: Int = 1): String {
        val key = requireString(arguments, 0, "key")
        val namespace = requireString(arguments, namespaceIndex, "namespace")
        return "${encodePart(namespace)}.${encodePart(key)}"
    }

    private fun requireString(arguments: List<Any?>, index: Int, label: String): String {
        val value = arguments.getOrNull(index) as? String
            ?: throw invalidArgument("SecureStore $label must be a non-empty string")
        if (value.isEmpty()) throw invalidArgument("SecureStore $label must be a non-empty string")
        return value
    }

    private fun encodePart(value: String): String = Base64.encodeToString(
        value.toByteArray(StandardCharsets.UTF_8),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val payload = Base64.encodeToString(ciphertext, Base64.NO_WRAP)
        return "$iv:$payload"
    }

    private fun decrypt(stored: String): String {
        val separator = stored.indexOf(':')
        if (separator <= 0 || separator == stored.lastIndex) {
            throw StingNativeModuleError(
                code = "E_SECURE_STORE",
                message = "SecureStore contains an invalid encrypted payload",
            )
        }
        val iv = Base64.decode(stored.substring(0, separator), Base64.NO_WRAP)
        val ciphertext = Base64.decode(stored.substring(separator + 1), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun invalidArgument(message: String) = StingNativeModuleError(
        code = "E_INVALID_ARGUMENT",
        message = message,
    )

    companion object {
        private const val KEY_ALIAS = "run.stingjs.secure-store.v1"
    }
}
