#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUICKJS_PACKAGE="$REPO_ROOT/native/ios/QuickJSRuntime"
FIXTURE_DIR="$QUICKJS_PACKAGE/Tests/StingQuickJSRuntimeTests/Fixtures"
HELLO_BUNDLE_SOURCE="$REPO_ROOT/examples/hello-world/dist/sting-app.js"
HELLO_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-app.js"
QUICKJS_BUILD_SCRIPT="$REPO_ROOT/runtime/prototypes/quickjs/ios/build-ios.sh"
QUICKJS_LIBRARY_DIR="$REPO_ROOT/runtime/prototypes/quickjs/ios/build/simulator"

cd "$REPO_ROOT"
npm run build --workspace @stingjs/example-hello-world

mkdir -p "$FIXTURE_DIR"
cp "$HELLO_BUNDLE_SOURCE" "$HELLO_BUNDLE_FIXTURE"

bash "$QUICKJS_BUILD_SCRIPT" "$QUICKJS_LIBRARY_DIR"
test -f "$QUICKJS_LIBRARY_DIR/libsting_quickjs_ios.a"

DEVICE_ID="$(
  xcrun simctl list devices available \
    | grep -m1 -E 'iPhone .*[0-9A-Fa-f-]{36}' \
    | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/'
)"

if [[ -z "$DEVICE_ID" ]]; then
  echo "No available iPhone Simulator was found." >&2
  exit 1
fi

cd "$QUICKJS_PACKAGE"
xcodebuild \
  -scheme StingQuickJSRuntime \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  CODE_SIGNING_ALLOWED=NO \
  test
