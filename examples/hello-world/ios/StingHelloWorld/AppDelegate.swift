import StingHaptics
import StingRuntime
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    private var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let host = StingHostViewController(nativeModules: [HapticsModule()])
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = host
        window.makeKeyAndVisible()
        self.window = window

        host.loadViewIfNeeded()

        guard let bundleURL = Bundle.main.url(forResource: "sting-app", withExtension: "js") else {
            host.presentRuntimeError(StingRuntimeError("sting-app.js is missing from the application bundle"))
            return true
        }

        host.loadJavaScriptBundle(at: bundleURL)
        return true
    }
}
