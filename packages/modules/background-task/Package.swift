// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "StingBackgroundTask",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingBackgroundTask", targets: ["StingBackgroundTask"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [.target(name: "StingBackgroundTask", dependencies: [.product(name: "StingRuntime", package: "ios")], path: "ios")]
)
