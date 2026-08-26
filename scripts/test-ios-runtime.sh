#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/native/ios/Tests/StingRuntimeTests/Fixtures"
HELLO_BUNDLE_SOURCE="$REPO_ROOT/examples/hello-world/dist/sting-app.js"
HELLO_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-app.js"
BENCHMARK_BUNDLE_SOURCE="$REPO_ROOT/benchmarks/sting-benchmark/dist/sting-benchmark.js"
BENCHMARK_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-benchmark.js"
ASYNC_BUNDLE_SOURCE="$REPO_ROOT/examples/async-native/dist/sting-async-native.js"
ASYNC_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-async-native.js"
CONFORMANCE_BUNDLE_SOURCE="$REPO_ROOT/benchmarks/solid2-conformance/dist/sting-solid2-conformance.js"
CONFORMANCE_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-solid2-conformance.js"

cd "$REPO_ROOT"
npm run build --workspace @stingjs/example-hello-world
npm run build --workspace @stingjs/benchmark-native
npm run build --workspace @stingjs/example-async-native
npm run build --workspace @stingjs/solid2-conformance

mkdir -p "$FIXTURE_DIR"
cp "$HELLO_BUNDLE_SOURCE" "$HELLO_BUNDLE_FIXTURE"
cp "$BENCHMARK_BUNDLE_SOURCE" "$BENCHMARK_BUNDLE_FIXTURE"
cp "$ASYNC_BUNDLE_SOURCE" "$ASYNC_BUNDLE_FIXTURE"
cp "$CONFORMANCE_BUNDLE_SOURCE" "$CONFORMANCE_BUNDLE_FIXTURE"

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
