#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$REPO_ROOT/dist/ios-host}"
PACKAGE_DIR="$ARTIFACT_DIR/StingQuickJSRuntime"
CONSUMER_DIR="$ARTIFACT_DIR/StingExternalIOSHost"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: the iOS host consumer proof must run on macOS" >&2
  exit 1
fi

for path in \
  "$PACKAGE_DIR/Package.swift" \
  "$PACKAGE_DIR/Artifacts/StingQuickJSBinary.xcframework" \
  "$PACKAGE_DIR/Sources/StingRuntime" \
  "$PACKAGE_DIR/Sources/StingQuickJSABI" \
  "$PACKAGE_DIR/Sources/StingQuickJSRuntime"; do
  if [[ ! -e "$path" ]]; then
    echo "error: missing distributable iOS host input: $path" >&2
    exit 1
  fi
done

if grep -R -I -n -E '(\.\./){2,}(native|packages|runtime)/' "$PACKAGE_DIR" --exclude-dir=.build; then
  echo "error: distributable iOS host must not reference Sting monorepo source paths" >&2
  exit 1
fi

# Build an actual downstream consumer package rather than merely rebuilding the
# distributed package itself. The consumer knows only the sibling packaged
# Sting host; it never references this repository's native/runtime source tree.
rm -rf "$CONSUMER_DIR"
mkdir -p "$CONSUMER_DIR/Sources/StingExternalIOSHost"
cat > "$CONSUMER_DIR/Package.swift" <<'SWIFT'
// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "StingExternalIOSHost",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "StingExternalIOSHost", targets: ["StingExternalIOSHost"])
    ],
    dependencies: [
        .package(path: "../StingQuickJSRuntime")
    ],
    targets: [
        .target(
            name: "StingExternalIOSHost",
            dependencies: [
                .product(name: "StingQuickJSRuntime", package: "StingQuickJSRuntime")
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
SWIFT

cat > "$CONSUMER_DIR/Sources/StingExternalIOSHost/StingExternalIOSHost.swift" <<'SWIFT'
import UIKit
import StingQuickJSRuntime

public enum StingExternalIOSHost {
    @MainActor
    public static func makeRuntime(rootView: UIView) throws -> StingQuickJSRuntime {
        try StingQuickJSRuntime(rootView: rootView)
    }
}
SWIFT

if grep -R -I -n -E '(\.\./){2,}(native|packages|runtime)/' "$CONSUMER_DIR" --exclude-dir=.build; then
  echo "error: external iOS consumer must not reference Sting monorepo source paths" >&2
  exit 1
fi

# The producer may use Zig. The consumer must not. Restrict PATH to normal
# Apple/system tools and explicitly prove that Zig is not visible before Xcode
# resolves the packaged dependency and compiles the downstream target.
consumer_path="/usr/bin:/bin:/usr/sbin:/sbin"
if env PATH="$consumer_path" sh -c 'command -v zig >/dev/null 2>&1'; then
  echo "error: Zig unexpectedly remains available in the external iOS consumer PATH" >&2
  exit 1
fi

(
  cd "$CONSUMER_DIR"
  env PATH="$consumer_path" xcodebuild \
    -scheme StingExternalIOSHost \
    -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO \
    build
  env PATH="$consumer_path" xcodebuild \
    -scheme StingExternalIOSHost \
    -destination 'generic/platform=iOS' \
    CODE_SIGNING_ALLOWED=NO \
    build
)

printf 'external iOS consumer imported and built the packaged QuickJS host for simulator and device without Zig: %s\n' "$CONSUMER_DIR"
