// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingBackgroundTask",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingBackgroundTask", targets: ["StingBackgroundTask"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingBackgroundTask",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
