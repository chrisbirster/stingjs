// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "StingContacts",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingContacts", targets: ["StingContacts"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [.target(name: "StingContacts", dependencies: [.product(name: "StingRuntime", package: "ios")], path: "ios")]
)
