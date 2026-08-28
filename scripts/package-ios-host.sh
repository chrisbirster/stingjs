#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/dist/ios-host}"
PACKAGE_DIR="$OUTPUT_DIR/StingQuickJSRuntime"
BUILD_DIR="$OUTPUT_DIR/build"
SIM_ARM64_DIR="$BUILD_DIR/simulator-arm64"
SIM_X86_64_DIR="$BUILD_DIR/simulator-x86_64"
SIM_UNIVERSAL_DIR="$BUILD_DIR/simulator-universal"
DEVICE_ARM64_DIR="$BUILD_DIR/device-arm64"
ABI_HEADERS="$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSABI/include"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: the iOS host producer must run on macOS" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$SIM_ARM64_DIR" "$SIM_X86_64_DIR" "$SIM_UNIVERSAL_DIR" "$DEVICE_ARM64_DIR"

# Producer boundary: building Sting from source is allowed to require Zig.
# Build both simulator architectures plus the production device architecture so
# the distributed XCFramework is independent of the producer Mac architecture.
bash "$REPO_ROOT/runtime/prototypes/quickjs/ios/build-ios.sh" "$SIM_ARM64_DIR" simulator arm64
bash "$REPO_ROOT/runtime/prototypes/quickjs/ios/build-ios.sh" "$SIM_X86_64_DIR" simulator x86_64
bash "$REPO_ROOT/runtime/prototypes/quickjs/ios/build-ios.sh" "$DEVICE_ARM64_DIR" device arm64

SIM_ARM64_LIBRARY="$SIM_ARM64_DIR/libsting_quickjs_ios.a"
SIM_X86_64_LIBRARY="$SIM_X86_64_DIR/libsting_quickjs_ios.a"
SIM_UNIVERSAL_LIBRARY="$SIM_UNIVERSAL_DIR/libsting_quickjs_ios.a"
DEVICE_ARM64_LIBRARY="$DEVICE_ARM64_DIR/libsting_quickjs_ios.a"

for library in "$SIM_ARM64_LIBRARY" "$SIM_X86_64_LIBRARY" "$DEVICE_ARM64_LIBRARY"; do
  test -f "$library"
done

xcrun lipo -create \
  "$SIM_ARM64_LIBRARY" \
  "$SIM_X86_64_LIBRARY" \
  -output "$SIM_UNIVERSAL_LIBRARY"

xcrun lipo -info "$SIM_UNIVERSAL_LIBRARY" | grep -F 'arm64' >/dev/null
xcrun lipo -info "$SIM_UNIVERSAL_LIBRARY" | grep -F 'x86_64' >/dev/null
xcrun lipo -info "$DEVICE_ARM64_LIBRARY" | grep -F 'arm64' >/dev/null

mkdir -p \
  "$PACKAGE_DIR/Sources" \
  "$PACKAGE_DIR/Artifacts"
cp -R "$REPO_ROOT/native/ios/Sources/StingRuntime" "$PACKAGE_DIR/Sources/StingRuntime"
cp -R "$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSABI" "$PACKAGE_DIR/Sources/StingQuickJSABI"
cp -R "$REPO_ROOT/native/ios/QuickJSRuntime/Sources/StingQuickJSRuntime" "$PACKAGE_DIR/Sources/StingQuickJSRuntime"
cp "$REPO_ROOT/LICENSE" "$PACKAGE_DIR/LICENSE"

xcodebuild -create-xcframework \
  -library "$SIM_UNIVERSAL_LIBRARY" \
  -headers "$ABI_HEADERS" \
  -library "$DEVICE_ARM64_LIBRARY" \
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

printf 'packaged iOS host (device arm64 + simulator arm64/x86_64):\n  %s\n  %s\n' \
  "$PACKAGE_DIR" \
  "$OUTPUT_DIR/sting-ios-host.zip"
