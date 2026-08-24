// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingRuntime",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingRuntime", targets: ["StingRuntime"])
    ],
    targets: [
        .target(
            name: "StingRuntime",
            path: "Sources/StingRuntime",
            linkerSettings: [
                .linkedFramework("JavaScriptCore"),
                .linkedFramework("UIKit")
            ]
        ),
        .testTarget(
            name: "StingRuntimeTests",
            dependencies: ["StingRuntime"],
            path: "Tests/StingRuntimeTests",
            resources: [
                .copy("Fixtures")
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
