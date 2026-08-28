#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/dist/ios-host}"
PACKAGE_DIR="$OUTPUT_DIR/StingQuickJSRuntime"
QUICKJS_BUILD_DIR="$OUTPUT_DIR/build/simulator"
QUICKJS_LIBRARY="$QUICKJS_BUILD_DIR/libsting_quickjs_ios.a"
ABI_HEADERS="$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSABI/include"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: the iOS host producer must run on macOS" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$QUICKJS_BUILD_DIR"

# Producer boundary: building Sting from source is allowed to require Zig.
# The package copied below contains only Swift/C source plus a prebuilt
# official-QuickJS/Sting binary and is verified separately with Zig absent.
bash "$REPO_ROOT/runtime/prototypes/quickjs/ios/build-ios.sh" "$QUICKJS_BUILD_DIR"
test -f "$QUICKJS_LIBRARY"

mkdir -p \
  "$PACKAGE_DIR/Sources" \
  "$PACKAGE_DIR/Artifacts"
cp -R "$REPO_ROOT/native/ios/Sources/StingRuntime" "$PACKAGE_DIR/Sources/StingRuntime"
cp -R "$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSABI" "$PACKAGE_DIR/Sources/StingQuickJSABI"
cp -R "$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSRuntime" "$PACKAGE_DIR/Sources/StingQuickJSRuntime"
cp "$REPO_ROOT/LICENSE" "$PACKAGE_DIR/LICENSE"

xcodebuild -create-xcframework \
  -library "$QUICKJS_LIBRARY" \
  -headers "$ABI_HEADERS" \
  -output "$PACKAGE_DIR/Artifacts/StingQuickJSBinary.xcframework"

cat > "$PACKAGE_DIR/Package.swift" <<'SWIFT'
// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingQuickJSRuntime",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingQuickJSRuntime", targets: ["StingQuickJSRuntime"])
    ],
    targets: [
        .binaryTarget(
            name: "StingQuickJSBinary",
            path: "Artifacts/StingQuickJSBinary.xcframework"
        ),
        .target(
            name: "StingRuntime",
            path: "Sources/StingRuntime",
            linkerSettings: [
                .linkedFramework("JavaScriptCore"),
                .linkedFramework("UIKit")
            ]
        ),
        .target(
            name: "StingQuickJSABI",
            dependencies: ["StingQuickJSBinary"],
            path: "Sources/StingQuickJSABI",
            publicHeadersPath: "include"
        ),
        .target(
            name: "StingQuickJSRuntime",
            dependencies: [
                "StingRuntime",
                "StingQuickJSABI",
                "StingQuickJSBinary"
            ],
            path: "Sources/StingQuickJSRuntime",
            linkerSettings: [
                .linkedFramework("UIKit")
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
SWIFT

if grep -R -I -n -E '(\.\./){2,}(native|packages|runtime)/' "$PACKAGE_DIR" --exclude-dir=.build; then
  echo "error: distributable iOS package must not reference Sting monorepo source paths" >&2
  exit 1
fi

(
  cd "$OUTPUT_DIR"
  ditto -c -k --sequesterRsrc --keepParent StingQuickJSRuntime sting-ios-host.zip
)

printf 'packaged iOS host:\n  %s\n  %s\n' \
  "$PACKAGE_DIR" \
  "$OUTPUT_DIR/sting-ios-host.zip"
