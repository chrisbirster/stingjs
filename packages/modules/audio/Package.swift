// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "StingAudio",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingAudio", targets: ["StingAudio"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [.target(name: "StingAudio", dependencies: [.product(name: "StingRuntime", package: "ios")], path: "ios")]
)
