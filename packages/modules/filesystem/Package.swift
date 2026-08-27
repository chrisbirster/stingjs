// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingFilesystem",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingFilesystem", targets: ["StingFilesystem"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingFilesystem",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
