#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$REPO_ROOT/dist/ios-host}"
PACKAGE_DIR="$ARTIFACT_DIR/StingQuickJSRuntime"

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
  echo "error: external iOS consumer must not reference Sting monorepo source paths" >&2
  exit 1
fi

# The producer may use Zig. The consumer must not. Restrict PATH to normal
# Apple/system tools and explicitly prove that Zig is not visible before Xcode
# resolves and builds the standalone Swift package.
consumer_path="/usr/bin:/bin:/usr/sbin:/sbin"
if env PATH="$consumer_path" sh -c 'command -v zig >/dev/null 2>&1'; then
  echo "error: Zig unexpectedly remains available in the external iOS consumer PATH" >&2
  exit 1
fi

(
  cd "$PACKAGE_DIR"
  env PATH="$consumer_path" xcodebuild \
    -scheme StingQuickJSRuntime \
    -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO \
    build
  env PATH="$consumer_path" xcodebuild \
    -scheme StingQuickJSRuntime \
    -destination 'generic/platform=iOS' \
    CODE_SIGNING_ALLOWED=NO \
    build
)

printf 'external iOS QuickJS host package built for simulator and device without Zig: %s\n' "$PACKAGE_DIR"
