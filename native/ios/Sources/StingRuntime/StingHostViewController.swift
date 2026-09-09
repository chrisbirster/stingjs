import UIKit

open class StingHostViewController: UIViewController {
    public let nativeModules: [any StingNativeModule]
    public let collectPerformanceDiagnostics: Bool
    public private(set) var runtime: StingJavaScriptRuntime?

    private let rootStack = UIStackView()

    public init(
        nativeModules: [any StingNativeModule] = [],
        collectPerformanceDiagnostics: Bool = false
    ) {
        self.nativeModules = nativeModules
        self.collectPerformanceDiagnostics = collectPerformanceDiagnostics
        super.init(nibName: nil, bundle: nil)
    }

    deinit {
        runtime?.dispose()
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    open override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        rootStack.axis = .vertical
        rootStack.alignment = .fill
        rootStack.distribution = .fill
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rootStack)

        // The Sting root is intentionally full-bleed. Applications opt into system-safe
        // content with the public <SafeArea> primitive instead of inheriting an invisible
        // host-controller inset that makes edge-to-edge layouts impossible.
        NSLayoutConstraint.activate([
            rootStack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rootStack.topAnchor.constraint(equalTo: view.topAnchor),
            rootStack.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        do {
            runtime = try StingJavaScriptRuntime(
                rootView: rootStack,
                modules: nativeModules,
                collectPerformanceDiagnostics: collectPerformanceDiagnostics
            )
        } catch {
            presentRuntimeError(error)
        }
    }

    public func loadJavaScriptBundle(at url: URL) {
        guard let runtime else {
            presentRuntimeError(StingRuntimeError("Sting runtime is not initialized"))
            return
        }

        do {
            let source = try String(contentsOf: url, encoding: .utf8)
            try runtime.evaluate(bundle: source, sourceURL: url)
        } catch {
            presentRuntimeError(error)
        }
    }

    open func presentRuntimeError(_ error: Error) {
        let label = UILabel()
        label.numberOfLines = 0
        label.textColor = .systemRed
        label.text = "Sting runtime error:\n\(error.localizedDescription)"
        rootStack.addArrangedSubview(label)
    }
}
