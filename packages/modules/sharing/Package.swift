// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingSharing",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingSharing", targets: ["StingSharing"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingSharing",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
