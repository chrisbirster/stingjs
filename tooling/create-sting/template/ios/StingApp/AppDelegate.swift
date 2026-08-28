import StingQuickJSRuntime
import UIKit

private enum StingAppLaunchError: LocalizedError {
    case missingJavaScriptBundle

    var errorDescription: String? {
        switch self {
        case .missingJavaScriptBundle:
            return "sting-app.js is missing from the application bundle"
        }
    }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var runtime: StingQuickJSRuntime?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let rootViewController = UIViewController()
        rootViewController.view.backgroundColor = .systemBackground

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = rootViewController
        window.makeKeyAndVisible()
        self.window = window

        do {
            guard let bundleURL = Bundle.main.url(forResource: "sting-app", withExtension: "js") else {
                throw StingAppLaunchError.missingJavaScriptBundle
            }
            let source = try String(contentsOf: bundleURL, encoding: .utf8)
            let runtime = try StingQuickJSRuntime(rootView: rootViewController.view)
            runtime.runtimeErrorSink = { error in
                NSLog("Sting runtime error: %@", error.localizedDescription)
            }
            self.runtime = runtime
            try runtime.evaluate(bundle: source, sourceURL: bundleURL)
        } catch {
            presentLaunchError(error, in: rootViewController.view)
        }

        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
        runtime?.dispose()
        runtime = nil
    }

    private func presentLaunchError(_ error: Error, in rootView: UIView) {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.numberOfLines = 0
        label.textAlignment = .center
        label.text = "Sting failed to start:\n\(error.localizedDescription)"
        rootView.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: rootView.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: rootView.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            label.centerYAnchor.constraint(equalTo: rootView.centerYAnchor),
        ])
    }
}
