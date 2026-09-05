// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingGeneratedModules",
    platforms: [.iOS(.v16)],
    products: [.library(name: "StingGeneratedModules", targets: ["StingGeneratedModules"])],
    dependencies: [.package(path: "../../../ios/StingQuickJSRuntime")],
    targets: [
        .target(
            name: "StingGeneratedModules",
            dependencies: [.product(name: "StingRuntime", package: "StingQuickJSRuntime")],
            path: "Sources/StingGeneratedModules"
        )
    ],
    swiftLanguageVersions: [.v5]
)
