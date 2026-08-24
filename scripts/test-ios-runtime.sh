#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/native/ios/Tests/StingRuntimeTests/Fixtures"
BUNDLE_SOURCE="$REPO_ROOT/examples/hello-world/dist/sting-app.js"
BUNDLE_FIXTURE="$FIXTURE_DIR/sting-app.js"

cd "$REPO_ROOT"
npm run build --workspace @stingjs/example-hello-world

mkdir -p "$FIXTURE_DIR"
cp "$BUNDLE_SOURCE" "$BUNDLE_FIXTURE"

DEVICE_ID="$(
  xcrun simctl list devices available \
    | grep -m1 -E 'iPhone .*[0-9A-Fa-f-]{36}' \
    | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/'
)"

if [[ -z "$DEVICE_ID" ]]; then
  echo "No available iPhone Simulator was found." >&2
  exit 1
fi

cd "$REPO_ROOT/native/ios"
xcodebuild \
  -scheme StingRuntime \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  CODE_SIGNING_ALLOWED=NO \
  test
