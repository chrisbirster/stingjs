// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingClipboard",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingClipboard", targets: ["StingClipboard"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingClipboard",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
