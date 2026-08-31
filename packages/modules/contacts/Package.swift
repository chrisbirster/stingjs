// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingContacts",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingContacts", targets: ["StingContacts"])
    ],
    dependencies: [
        .package(path: "../../../native/ios")
    ],
    targets: [
        .target(
            name: "StingContacts",
            dependencies: [
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "ios"
        )
    ],
    swiftLanguageVersions: [.v5]
)
