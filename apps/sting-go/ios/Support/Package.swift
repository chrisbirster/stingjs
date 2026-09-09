// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingGoSupport",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "StingGoSupport", targets: ["StingGoSupport"])
    ],
    targets: [
        .target(name: "StingGoSupport"),
        .testTarget(
            name: "StingGoSupportTests",
            dependencies: ["StingGoSupport"]
        )
    ],
    swiftLanguageVersions: [.v5]
)
