// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingSecureStore",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingSecureStore", targets: ["StingSecureStore"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingSecureStore",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
