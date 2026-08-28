import Foundation
import StingClipboard
import StingGoSupport
import StingHaptics
import StingQuickJSRuntime
import StingRuntime
import UIKit

@MainActor
final class StingGoViewController: UIViewController {
    private struct LoadedProject {
        let manifest: StingGoManifest
        let bundleSource: String
        let bundleURL: URL
        let reloadVersion: Int
    }

    private struct ClientError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private static let lastManifestURLKey = "sting-go.last-manifest-url"
    private let availableCapabilities: Set<String> = ["clipboard", "haptics"]
    private let session = URLSession.shared

    private var currentManifestURL: URL?
    private var loadTask: Task<Void, Never>?
    private var runtime: StingQuickJSRuntime?
    private var runtimeToken: UUID?
    private var reloadClient: StingGoReloadClient?
    private var reloadClientToken: UUID?
    private var loadedReloadVersion: Int?
    private var statusLabel: UILabel?
    private var reloadStatusLabel: UILabel?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let saved = UserDefaults.standard.string(forKey: Self.lastManifestURLKey)
            .flatMap(URL.init(string:))
        currentManifestURL = saved
        showLauncher(prefill: saved?.absoluteString)
    }

    deinit {
        loadTask?.cancel()
        reloadClient?.close()
        try? runtime?.close()
    }

    func open(deepLink: URL) {
        loadViewIfNeeded()
        do {
            let manifestURL = try manifestURL(from: deepLink)
            loadProject(manifestURL)
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func showLauncher(prefill: String?) {
        cancelProject()

        let title = UILabel()
        title.text = "Sting Go"
        title.font = .systemFont(ofSize: 32, weight: .bold)
        title.textAlignment = .center

        let subtitle = UILabel()
        subtitle.text = "Open a SolidJS 2 Sting development server"
        subtitle.font = .systemFont(ofSize: 16)
        subtitle.textColor = .secondaryLabel
        subtitle.textAlignment = .center
        subtitle.numberOfLines = 0

        let input = UITextField()
        input.accessibilityIdentifier = "sting-go-manifest-url"
        input.placeholder = "http://192.168.1.10:8081/manifest"
        input.text = prefill
        input.borderStyle = .roundedRect
        input.keyboardType = .URL
        input.autocapitalizationType = .none
        input.autocorrectionType = .no
        input.clearButtonMode = .whileEditing

        let openButton = UIButton(type: .system)
        openButton.accessibilityIdentifier = "sting-go-load"
        openButton.setTitle("Open project", for: .normal)
        openButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        openButton.addAction(UIAction { [weak self, weak input] _ in
            guard let self, let raw = input?.text else { return }
            do {
                self.loadProject(try self.normalizeManifestURL(raw))
            } catch {
                self.showError(error.localizedDescription)
            }
        }, for: .touchUpInside)

        let status = UILabel()
        status.accessibilityIdentifier = "sting-go-status"
        status.textColor = .systemRed
        status.textAlignment = .center
        status.numberOfLines = 0
        status.font = .systemFont(ofSize: 14)
        statusLabel = status

        let stack = UIStackView(arrangedSubviews: [title, subtitle, input, openButton, status])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false

        let container = UIView()
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])
        replaceRoot(with: container)
    }

    private func showLoading(_ manifestURL: URL) {
        releaseRuntime()

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.startAnimating()
        let label = UILabel()
        label.text = "Connecting to Sting development server…\n\n\(manifestURL.absoluteString)"
        label.textAlignment = .center
        label.numberOfLines = 0
        label.textColor = .secondaryLabel

        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.axis = .vertical
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        let container = UIView()
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])
        replaceRoot(with: container)
    }

    private func showError(_ message: String) {
        showLauncher(prefill: currentManifestURL?.absoluteString)
        statusLabel?.text = "Could not open project:\n\(message)"
    }

    private func loadProject(_ manifestURL: URL) {
        loadTask?.cancel()
        releaseRuntime()
        currentManifestURL = manifestURL
        UserDefaults.standard.set(manifestURL.absoluteString, forKey: Self.lastManifestURLKey)
        showLoading(manifestURL)

        loadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let project = try await self.fetchProject(manifestURL)
                try Task.checkCancellation()
                self.loadTask = nil
                self.mountProject(manifestURL: manifestURL, project: project)
            } catch is CancellationError {
                return
            } catch {
                if Task.isCancelled { return }
                self.loadTask = nil
                self.showError(error.localizedDescription)
            }
        }
    }

    private func fetchProject(_ manifestURL: URL) async throws -> LoadedProject {
        let manifestData = try await fetchData(
            manifestURL,
            expectedContentType: "application/json"
        )
        let manifest = try StingGoManifest.decode(manifestData)
        try manifest.validate(clientCapabilities: availableCapabilities)

        let bundleURL = try manifest.endpointURL(path: manifest.bundle.path, relativeTo: manifestURL)
        let healthURL = try manifest.endpointURL(
            path: manifest.development.health.path,
            relativeTo: manifestURL
        )

        for _ in 0..<4 {
            try Task.checkCancellation()
            let beforeVersion = try await fetchHealthVersion(healthURL)
            let bundleData = try await fetchData(
                bundleURL,
                expectedContentType: manifest.bundle.contentType
            )
            guard let source = String(data: bundleData, encoding: .utf8), !source.isEmpty else {
                throw ClientError(message: "Downloaded Sting bundle is empty or not UTF-8")
            }
            let afterVersion = try await fetchHealthVersion(healthURL)
            if beforeVersion == afterVersion {
                return LoadedProject(
                    manifest: manifest,
                    bundleSource: source,
                    bundleURL: bundleURL,
                    reloadVersion: afterVersion
                )
            }
        }

        throw ClientError(
            message: "The Sting bundle kept changing while it was being downloaded; retry after the current build finishes"
        )
    }

    private func fetchHealthVersion(_ healthURL: URL) async throws -> Int {
        let data = try await fetchData(healthURL, expectedContentType: "application/json")
        let health: StingGoHealth
        do {
            health = try JSONDecoder().decode(StingGoHealth.self, from: data)
        } catch {
            throw ClientError(message: "Invalid Sting development server health response: \(error.localizedDescription)")
        }
        guard health.ok else {
            throw ClientError(message: "Sting development server health check failed")
        }
        guard health.reloadVersion >= 0 else {
            throw ClientError(message: "Sting development server returned an invalid reload version")
        }
        return health.reloadVersion
    }

    private func fetchData(_ url: URL, expectedContentType: String) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError(message: "Development server did not return an HTTP response for \(url.absoluteString)")
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let suffix = body.isEmpty ? "" : ": \(body)"
            throw ClientError(message: "HTTP \(http.statusCode) from \(url.absoluteString)\(suffix)")
        }
        guard response.mimeType?.lowercased() == expectedContentType.lowercased() else {
            throw ClientError(
                message: "Expected \(expectedContentType) from \(url.absoluteString), got \(response.mimeType ?? "no content type")"
            )
        }
        return data
    }

    private func mountProject(manifestURL: URL, project: LoadedProject) {
        releaseRuntime()

        let projectName = UILabel()
        projectName.text = project.manifest.project.name
        projectName.font = .systemFont(ofSize: 16, weight: .semibold)
        projectName.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let liveStatus = UILabel()
        liveStatus.text = "Connecting…"
        liveStatus.font = .systemFont(ofSize: 12)
        liveStatus.textColor = .secondaryLabel
        liveStatus.setContentHuggingPriority(.required, for: .horizontal)
        reloadStatusLabel = liveStatus

        let reloadButton = UIButton(type: .system)
        reloadButton.accessibilityIdentifier = "sting-go-reload"
        reloadButton.setTitle("Reload", for: .normal)
        reloadButton.addAction(UIAction { [weak self] _ in
            guard let self, let url = self.currentManifestURL else { return }
            self.loadProject(url)
        }, for: .touchUpInside)

        let closeButton = UIButton(type: .system)
        closeButton.accessibilityIdentifier = "sting-go-close"
        closeButton.setTitle("Close", for: .normal)
        closeButton.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.showLauncher(prefill: self.currentManifestURL?.absoluteString)
        }, for: .touchUpInside)

        let toolbar = UIStackView(arrangedSubviews: [projectName, liveStatus, reloadButton, closeButton])
        toolbar.axis = .horizontal
        toolbar.alignment = .center
        toolbar.spacing = 10
        toolbar.isLayoutMarginsRelativeArrangement = true
        toolbar.layoutMargins = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 8)
        toolbar.translatesAutoresizingMaskIntoConstraints = false

        let contentRoot = UIView()
        contentRoot.accessibilityIdentifier = "sting-go-content-root"
        contentRoot.translatesAutoresizingMaskIntoConstraints = false

        let container = UIView()
        container.addSubview(toolbar)
        container.addSubview(contentRoot)
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            contentRoot.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            contentRoot.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            contentRoot.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            contentRoot.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        replaceRoot(with: container)

        do {
            let modules: [any StingNativeModule] = [HapticsModule(), ClipboardModule()]
            let quickJS = try StingQuickJSRuntime(rootView: contentRoot, modules: modules)
            let token = UUID()
            runtime = quickJS
            runtimeToken = token
            loadedReloadVersion = project.reloadVersion
            quickJS.runtimeErrorSink = { [weak self] error in
                Task { @MainActor [weak self] in
                    guard let self, self.runtimeToken == token else { return }
                    self.showError("JavaScript runtime error: \(error.localizedDescription)")
                }
            }
            try quickJS.evaluate(bundle: project.bundleSource, sourceURL: project.bundleURL)
            startReloadClient(manifestURL: manifestURL, manifest: project.manifest)
        } catch {
            releaseRuntime()
            showError("JavaScript evaluation failed: \(error.localizedDescription)")
        }
    }

    private func startReloadClient(manifestURL: URL, manifest: StingGoManifest) {
        do {
            let reloadURL = try manifest.endpointURL(
                path: manifest.development.reload.path,
                relativeTo: manifestURL
            )
            let token = UUID()
            let client = StingGoReloadClient(
                endpointURL: reloadURL,
                onEvent: { [weak self] event in
                    Task { @MainActor [weak self] in
                        guard let self, self.reloadClientToken == token else { return }
                        self.handleReloadEvent(event, manifestURL: manifestURL)
                    }
                },
                onStatus: { [weak self] status in
                    Task { @MainActor [weak self] in
                        guard let self, self.reloadClientToken == token else { return }
                        self.updateReloadStatus(status)
                    }
                }
            )
            reloadClientToken = token
            reloadClient = client
            client.start()
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func handleReloadEvent(_ event: StingGoReloadEvent, manifestURL: URL) {
        guard let loadedVersion = loadedReloadVersion else { return }
        if event.version == loadedVersion {
            reloadStatusLabel?.text = "Live"
            return
        }
        reloadStatusLabel?.text = event.name == .reload ? "Reloading…" : "Server changed…"
        loadProject(manifestURL)
    }

    private func updateReloadStatus(_ status: StingGoReloadStatus) {
        switch status {
        case .connecting:
            reloadStatusLabel?.text = "Connecting…"
        case .live:
            reloadStatusLabel?.text = "Live"
        case .reconnecting:
            reloadStatusLabel?.text = "Reconnecting…"
        }
    }

    private func cancelProject() {
        loadTask?.cancel()
        loadTask = nil
        releaseRuntime()
    }

    private func releaseRuntime() {
        reloadClientToken = nil
        reloadClient?.close()
        reloadClient = nil
        loadedReloadVersion = nil
        reloadStatusLabel = nil
        runtimeToken = nil
        try? runtime?.close()
        runtime = nil
    }

    private func manifestURL(from deepLink: URL) throws -> URL {
        guard deepLink.scheme == "sting", deepLink.host == "go" else {
            throw ClientError(message: "Invalid Sting Go deep link")
        }
        guard let components = URLComponents(url: deepLink, resolvingAgainstBaseURL: false),
              let raw = components.queryItems?.first(where: { $0.name == "url" })?.value else {
            throw ClientError(message: "Sting Go deep link is missing its url parameter")
        }
        return try normalizeManifestURL(raw)
    }

    private func normalizeManifestURL(_ raw: String) throws -> URL {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw ClientError(message: "Enter a Sting development manifest URL")
        }
        if let deepLink = URL(string: trimmed), deepLink.scheme == "sting" {
            return try manifestURL(from: deepLink)
        }
        guard let url = URL(string: trimmed),
              url.scheme == "http" || url.scheme == "https",
              url.host != nil else {
            throw ClientError(message: "Development server URL must use http or https")
        }
        return url
    }

    private func replaceRoot(with content: UIView) {
        view.subviews.forEach { $0.removeFromSuperview() }
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(content)
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: view.topAnchor),
            content.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }
}
