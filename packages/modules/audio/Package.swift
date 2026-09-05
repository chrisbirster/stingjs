// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingAudio",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingAudio", targets: ["StingAudio"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingAudio",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
