// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "StingNotifications",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingNotifications", targets: ["StingNotifications"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [.target(name: "StingNotifications", dependencies: [.product(name: "StingRuntime", package: "ios")], path: "ios")]
)
