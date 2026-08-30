// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "StingLocation",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "StingLocation", targets: ["StingLocation"])],
    dependencies: [.package(path: "../../../native/ios")],
    targets: [
        .target(
            name: "StingLocation",
            dependencies: [.product(name: "StingRuntime", package: "ios")],
            path: "ios"
        )
    ]
)
