// swift-tools-version: 5.10

import Foundation
import PackageDescription

let packageDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let quickJSSimulatorLibraryDirectory = packageDirectory
    .appendingPathComponent("../../../runtime/prototypes/quickjs/ios/build/simulator")
    .standardizedFileURL
    .path

let package = Package(
    name: "StingQuickJSRuntime",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingQuickJSRuntime", targets: ["StingQuickJSRuntime"])
    ],
    dependencies: [
        .package(path: "..")
    ],
    targets: [
        .target(
            name: "StingQuickJSABI",
            path: "Sources/StingQuickJSABI",
            publicHeadersPath: "include"
        ),
        .target(
            name: "StingQuickJSRuntime",
            dependencies: [
                .product(name: "StingRuntime", package: "ios"),
                "StingQuickJSABI"
            ],
            path: "Sources/StingQuickJSRuntime",
            linkerSettings: [
                .linkedFramework("UIKit"),
                .unsafeFlags([
                    "-L\(quickJSSimulatorLibraryDirectory)",
                    "-lsting_quickjs_ios"
                ])
            ]
        ),
        .testTarget(
            name: "StingQuickJSRuntimeTests",
            dependencies: [
                "StingQuickJSRuntime",
                .product(name: "StingRuntime", package: "ios")
            ],
            path: "Tests/StingQuickJSRuntimeTests",
            resources: [
                .copy("Fixtures")
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
