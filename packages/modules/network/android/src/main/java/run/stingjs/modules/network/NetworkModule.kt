package run.stingjs.modules.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import java.util.concurrent.Executors
import run.stingjs.runtime.StingNativeModule
import run.stingjs.runtime.StingNativeModuleCompletion
import run.stingjs.runtime.StingNativeModuleError
import run.stingjs.runtime.StingNativeModuleEventEmitter
import run.stingjs.runtime.StingNativeModuleResult

class NetworkModule(context: Context) : StingNativeModule {
    override val name = "Network"
    override val version = "0.1.0"

    private val connectivity = context.applicationContext.getSystemService(ConnectivityManager::class.java)
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "StingNetwork").apply { isDaemon = true }
    }
    private val callbackLock = Any()
    private var eventCallback: ConnectivityManager.NetworkCallback? = null

    override fun callSync(method: String, arguments: List<Any?>): Any? {
        throw StingNativeModuleError(
            code = "E_SYNC_UNSUPPORTED",
            message = "Network methods are asynchronous",
        )
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        if (method != "getState") {
            completion(
                StingNativeModuleResult.Failure(
                    StingNativeModuleError(
                        code = "E_METHOD_NOT_FOUND",
                        message = "Network does not implement asynchronous method $method",
                    ),
                ),
            )
            return
        }

        executor.execute {
            try {
                completion(StingNativeModuleResult.Success(snapshot()))
            } catch (error: Throwable) {
                completion(
                    StingNativeModuleResult.Failure(
                        StingNativeModuleError(
                            code = "E_NETWORK_UNAVAILABLE",
                            message = error.message ?: "Unable to inspect network state",
                        ),
                    ),
                )
            }
        }
    }

    override fun setEventEnabled(
        event: String,
        enabled: Boolean,
        emit: StingNativeModuleEventEmitter,
    ) {
        if (event != "change") {
            throw StingNativeModuleError(
                code = "E_EVENT_NOT_FOUND",
                message = "Network does not implement native event $event",
            )
        }

        val previous = synchronized(callbackLock) {
            eventCallback.also { eventCallback = null }
        }
        if (previous != null) {
            try {
                connectivity.unregisterNetworkCallback(previous)
            } catch (_: IllegalArgumentException) {
                // Already unregistered by the platform.
            }
        }
        if (!enabled) return

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = emit(snapshot())
            override fun onLost(network: Network) = emit(snapshot())
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = emit(snapshot())
        }
        synchronized(callbackLock) { eventCallback = callback }

        try {
            if (Build.VERSION.SDK_INT >= 24) {
                connectivity.registerDefaultNetworkCallback(callback)
            } else {
                connectivity.registerNetworkCallback(
                    NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build(),
                    callback,
                )
            }
        } catch (error: Throwable) {
            synchronized(callbackLock) {
                if (eventCallback === callback) eventCallback = null
            }
            throw StingNativeModuleError(
                code = "E_NETWORK_UNAVAILABLE",
                message = error.message ?: "Unable to observe network state",
            )
        }
    }

    private fun snapshot(): Map<String, Any?> {
        val active = connectivity.activeNetwork
        val capabilities = active?.let(connectivity::getNetworkCapabilities)
        if (capabilities == null) {
            return mapOf(
                "connected" to false,
                "internetReachable" to false,
                "type" to "none",
                "expensive" to false,
            )
        }

        val connected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        return mapOf(
            "connected" to connected,
            "internetReachable" to capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            "type" to networkType(capabilities, connected),
            "expensive" to !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
        )
    }

    private fun networkType(capabilities: NetworkCapabilities, connected: Boolean): String {
        if (!connected) return "none"
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }
}
