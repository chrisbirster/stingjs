// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingNetwork",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingNetwork", targets: ["StingNetwork"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingNetwork",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
