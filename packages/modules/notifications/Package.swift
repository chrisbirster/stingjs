// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingNotifications",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingNotifications", targets: ["StingNotifications"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingNotifications",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
