// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingDevice",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingDevice", targets: ["StingDevice"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingDevice",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
