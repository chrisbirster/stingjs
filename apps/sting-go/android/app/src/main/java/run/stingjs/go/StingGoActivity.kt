package run.stingjs.go

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import org.json.JSONObject
import run.stingjs.modules.clipboard.ClipboardModule
import run.stingjs.modules.haptics.HapticsModule
import run.stingjs.runtime.StingModuleRegistry
import run.stingjs.runtime.StingNativeBridge
import run.stingjs.runtime.StingNodeRegistry
import run.stingjs.runtime.candidates.quickjs.OfficialQuickJsCandidateRuntime

class StingGoActivity : Activity() {
    private data class LoadedProject(
        val manifest: StingGoManifest,
        val bundleSource: String,
        val reloadVersion: Long,
    )

    private val ioExecutor = Executors.newSingleThreadExecutor()
    private val availableCapabilities = setOf("clipboard", "haptics")
    private val preferences by lazy { getSharedPreferences("sting-go", MODE_PRIVATE) }

    private var currentManifestUrl: String? = null
    private var runtime: OfficialQuickJsCandidateRuntime? = null
    private var nodes: StingNodeRegistry? = null
    private var reloadClient: StingGoReloadClient? = null
    private var loadedReloadVersion: Long? = null
    private var reloadStatusView: TextView? = null
    private var statusView: TextView? = null
    private var requestedLoadId = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val deepLinkUrl = manifestUrlFromIntent(intent)
        showLauncher(deepLinkUrl ?: preferences.getString("lastManifestUrl", null))
        if (deepLinkUrl != null) loadProject(deepLinkUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        manifestUrlFromIntent(intent)?.let(::loadProject)
    }

    override fun onDestroy() {
        requestedLoadId += 1
        releaseRuntime()
        ioExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun showLauncher(prefill: String? = currentManifestUrl) {
        requestedLoadId += 1
        releaseRuntime()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(40), dp(24), dp(24))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        root.addView(TextView(this).apply {
            text = "Sting Go"
            textSize = 30f
        })
        root.addView(TextView(this).apply {
            text = "Open a SolidJS 2 Sting development server"
            textSize = 16f
            setPadding(0, dp(8), 0, dp(24))
        })

        val input = EditText(this).apply {
            tag = "sting-go-manifest-url"
            hint = "http://192.168.1.10:8081/manifest"
            setSingleLine(true)
            setText(prefill.orEmpty())
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }
        root.addView(input)

        root.addView(Button(this).apply {
            tag = "sting-go-load"
            text = "Open project"
            setOnClickListener {
                runCatching { normalizeManifestInput(input.text.toString()) }
                    .onSuccess(::loadProject)
                    .onFailure { error -> showError(error.message ?: "Invalid development server URL") }
            }
        })

        statusView = TextView(this).apply {
            tag = "sting-go-status"
            setPadding(0, dp(16), 0, 0)
        }
        root.addView(statusView)
        setContentView(root)
    }

    private fun showLoading(manifestUrl: String) {
        releaseRuntime()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        root.addView(TextView(this).apply {
            text = "Connecting to Sting development server…\n\n$manifestUrl"
            gravity = Gravity.CENTER
        })
        setContentView(root)
    }

    private fun showError(message: String) {
        showLauncher(currentManifestUrl)
        statusView?.text = "Could not open project:\n$message"
    }

    private fun loadProject(manifestUrl: String) {
        currentManifestUrl = manifestUrl
        preferences.edit().putString("lastManifestUrl", manifestUrl).apply()
        val loadId = requestedLoadId + 1
        requestedLoadId = loadId
        showLoading(manifestUrl)

        ioExecutor.execute {
            runCatching { fetchProject(manifestUrl) }
                .onSuccess { loadedProject ->
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed && requestedLoadId == loadId) {
                            mountProject(manifestUrl, loadedProject)
                        }
                    }
                }
                .onFailure { error ->
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed && requestedLoadId == loadId) {
                            showError(error.message ?: error.javaClass.simpleName)
                        }
                    }
                }
        }
    }

    private fun fetchProject(manifestUrl: String): LoadedProject {
        val manifestSource = fetchText(manifestUrl, "application/json")
        val manifest = StingGoManifest.parse(manifestSource)
        val unsupported = manifest.capabilities - availableCapabilities
        if (unsupported.isNotEmpty()) {
            val message = "This Sting Go build does not include required capabilities: ${unsupported.sorted().joinToString()}"
            reportClientError(manifestUrl, manifest, "compatibility", message)
            error(message)
        }

        val manifestBase = URL(manifestUrl)
        val bundleUrl = URL(manifestBase, manifest.bundlePath).toString()
        val healthUrl = URL(manifestBase, manifest.healthPath).toString()

        try {
            repeat(4) {
                val beforeVersion = fetchHealthVersion(healthUrl)
                val bundleSource = fetchText(bundleUrl, "application/javascript")
                require(bundleSource.isNotBlank()) { "Downloaded Sting bundle is empty" }
                val afterVersion = fetchHealthVersion(healthUrl)
                if (beforeVersion == afterVersion) {
                    return LoadedProject(
                        manifest = manifest,
                        bundleSource = bundleSource,
                        reloadVersion = afterVersion,
                    )
                }
            }

            error("The Sting bundle kept changing while it was being downloaded; retry after the current build finishes")
        } catch (error: Throwable) {
            reportClientError(
                manifestUrl,
                manifest,
                "bundle",
                error.message ?: error.javaClass.simpleName,
            )
            throw error
        }
    }

    private fun fetchHealthVersion(healthUrl: String): Long {
        val health = JSONObject(fetchText(healthUrl, "application/json"))
        require(health.optBoolean("ok", false)) { "Sting development server health check failed" }
        val reloadVersion = health.getLong("reloadVersion")
        require(reloadVersion >= 0) { "Sting development server returned an invalid reload version" }
        return reloadVersion
    }

    private fun mountProject(manifestUrl: String, loadedProject: LoadedProject) {
        releaseRuntime()
        val manifest = loadedProject.manifest

        val screen = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(8), dp(8), dp(8))
        }
        toolbar.addView(TextView(this).apply {
            text = manifest.projectName
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        })
        reloadStatusView = TextView(this).apply {
            text = "Connecting…"
            textSize = 12f
            setPadding(dp(8), 0, dp(8), 0)
        }
        toolbar.addView(reloadStatusView)
        toolbar.addView(Button(this).apply {
            text = "Reload"
            tag = "sting-go-reload"
            setOnClickListener { currentManifestUrl?.let(::loadProject) }
        })
        toolbar.addView(Button(this).apply {
            text = "Close"
            tag = "sting-go-close"
            setOnClickListener { showLauncher(currentManifestUrl) }
        })
        screen.addView(toolbar)

        val contentRoot = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        screen.addView(contentRoot)
        setContentView(screen)

        val nodeRegistry = StingNodeRegistry(contentRoot)
        val bridge = StingNativeBridge(
            nodes = nodeRegistry,
            modules = StingModuleRegistry(
                listOf(
                    HapticsModule(this),
                    ClipboardModule(this),
                ),
            ),
        )
        val quickJs = OfficialQuickJsCandidateRuntime(bridge)
        nodes = nodeRegistry
        runtime = quickJs
        quickJs.runtimeErrorSink = { error ->
            runOnUiThread {
                if (!isFinishing && !isDestroyed && runtime === quickJs) {
                    val message = error.message ?: error.javaClass.simpleName
                    reportClientError(manifestUrl, manifest, "runtime", message)
                    showError("JavaScript runtime error: $message")
                }
            }
        }
        nodeRegistry.eventSink = quickJs::dispatchEvent

        runCatching { quickJs.evaluate(loadedProject.bundleSource) }
            .onSuccess {
                loadedReloadVersion = loadedProject.reloadVersion
                startReloadClient(manifestUrl, manifest)
            }
            .onFailure { error ->
                val message = error.message ?: error.javaClass.simpleName
                reportClientError(manifestUrl, manifest, "runtime", message)
                releaseRuntime()
                showError("JavaScript evaluation failed: $message")
            }
    }

    private fun startReloadClient(manifestUrl: String, manifest: StingGoManifest) {
        val reloadUrl = URL(URL(manifestUrl), manifest.reloadPath).toString()
        lateinit var client: StingGoReloadClient
        client = StingGoReloadClient(
            endpointUrl = reloadUrl,
            onEvent = { event ->
                runOnUiThread {
                    if (!isFinishing && !isDestroyed && reloadClient === client) {
                        handleReloadEvent(manifestUrl, event)
                    }
                }
            },
            onStatus = { status ->
                runOnUiThread {
                    if (!isFinishing && !isDestroyed && reloadClient === client) {
                        reloadStatusView?.text = status
                    }
                }
            },
        )
        reloadClient = client
        client.start()
    }

    private fun handleReloadEvent(manifestUrl: String, event: StingGoReloadEvent) {
        val currentVersion = loadedReloadVersion ?: return
        if (event.version == currentVersion) {
            reloadStatusView?.text = "Live"
            return
        }

        reloadStatusView?.text = if (event.name == "reload") "Reloading…" else "Server changed…"
        loadProject(manifestUrl)
    }

    private fun reportClientError(
        manifestUrl: String,
        manifest: StingGoManifest,
        kind: String,
        message: String,
        detail: String? = null,
    ) {
        val path = manifest.reportPath ?: return
        val endpointUrl = runCatching { URL(URL(manifestUrl), path).toString() }.getOrNull() ?: return
        runCatching {
            ioExecutor.execute {
                runCatching {
                    StingGoReportClient.post(
                        endpointUrl = endpointUrl,
                        kind = kind,
                        message = message,
                        detail = detail,
                    )
                }
            }
        }
    }

    private fun releaseRuntime() {
        reloadClient?.close()
        reloadClient = null
        loadedReloadVersion = null
        reloadStatusView = null
        nodes?.eventSink = null
        nodes = null
        runtime?.close()
        runtime = null
    }

    private fun fetchText(url: String, expectedContentType: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.useCaches = false
        connection.setRequestProperty("Accept", expectedContentType)
        connection.setRequestProperty("User-Agent", "StingGo/0.1.0")
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            require(status in 200..299) { "HTTP $status from $url${if (body.isBlank()) "" else ": $body"}" }

            val mediaType = connection.contentType
                ?.substringBefore(';')
                ?.trim()
                ?.lowercase()
            require(mediaType == expectedContentType.lowercase()) {
                "Expected $expectedContentType from $url, got ${connection.contentType ?: "no content type"}"
            }
            return body
        } finally {
            connection.disconnect()
        }
    }

    private fun manifestUrlFromIntent(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        if (uri.scheme != "sting" || uri.host != "go") return null
        return uri.getQueryParameter("url")?.takeIf { it.isNotBlank() }
    }

    private fun normalizeManifestInput(raw: String): String {
        val trimmed = raw.trim()
        require(trimmed.isNotEmpty()) { "Enter a Sting development manifest URL" }
        if (trimmed.startsWith("sting://")) {
            val uri = Uri.parse(trimmed)
            require(uri.scheme == "sting" && uri.host == "go") { "Invalid Sting Go deep link" }
            return uri.getQueryParameter("url")?.takeIf { it.isNotBlank() }
                ?: error("Sting Go deep link is missing its url parameter")
        }
        val parsed = URL(trimmed)
        require(parsed.protocol == "http" || parsed.protocol == "https") {
            "Development server URL must use http or https"
        }
        return parsed.toString()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
