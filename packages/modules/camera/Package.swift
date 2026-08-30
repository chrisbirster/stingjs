// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "StingCamera",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingCamera", targets: ["StingCamera"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [.target(name: "StingCamera", dependencies: [.product(name: "StingRuntime", package: "ios")], path: "ios")]
)
