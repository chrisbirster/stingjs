// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingSensors",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingSensors", targets: ["StingSensors"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingSensors",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
