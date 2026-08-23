// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingHaptics",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingHaptics", targets: ["StingHaptics"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingHaptics",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
