// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingImagePicker",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingImagePicker", targets: ["StingImagePicker"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingImagePicker",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
