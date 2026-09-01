// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingLocation",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingLocation", targets: ["StingLocation"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingLocation",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
