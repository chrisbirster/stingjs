// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingCamera",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingCamera", targets: ["StingCamera"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingCamera",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
