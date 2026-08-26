#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/native/ios/Tests/StingRuntimeTests/Fixtures"
BENCHMARK_BUNDLE_SOURCE="$REPO_ROOT/benchmarks/sting-benchmark/dist/sting-benchmark.js"
BENCHMARK_BUNDLE_FIXTURE="$FIXTURE_DIR/sting-benchmark.js"
ARTIFACT_DIR="${STING_BENCHMARK_ARTIFACT_DIR:-$REPO_ROOT/.artifacts/benchmarks}"
LOG_PATH="$ARTIFACT_DIR/ios-jsc-control.xcodebuild.log"
OUTPUT_PATH="$ARTIFACT_DIR/ios-jsc-control.json"

: "${STING_IOS_DEVICE_ID:?Set STING_IOS_DEVICE_ID to a connected physical iPhone UDID}"
: "${STING_IOS_DEVICE_NAME:?Set STING_IOS_DEVICE_NAME to the exact device model/name used for the run}"
: "${STING_IOS_OS_VERSION:?Set STING_IOS_OS_VERSION to the device iOS version}"
: "${STING_IOS_REFRESH_HZ:?Set STING_IOS_REFRESH_HZ to the active display refresh rate}"

cd "$REPO_ROOT"
mkdir -p "$FIXTURE_DIR" "$ARTIFACT_DIR"

npm run build --workspace @stingjs/benchmark-native
cp "$BENCHMARK_BUNDLE_SOURCE" "$BENCHMARK_BUNDLE_FIXTURE"

export STING_BENCHMARK_COMMIT="$(git rev-parse HEAD)"
export STING_RECORDED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export STING_XCODE_VERSION="$(xcodebuild -version | tr '\n' ' ' | sed -E 's/[[:space:]]+$//')"
export STING_SWIFT_VERSION="$(xcrun swift --version | head -n1)"

XCODE_ARGS=(
  -scheme StingRuntime
  -configuration Release
  -destination "platform=iOS,id=$STING_IOS_DEVICE_ID"
  test
  -only-testing:StingRuntimeTests/StingBenchmarkCaptureTests/testSparseAndDenseNativeRoundTripCapture
)

if [[ -n "${STING_IOS_DEVELOPMENT_TEAM:-}" ]]; then
  XCODE_ARGS+=("DEVELOPMENT_TEAM=$STING_IOS_DEVELOPMENT_TEAM")
fi

(
  cd "$REPO_ROOT/native/ios"
  xcodebuild "${XCODE_ARGS[@]}"
) 2>&1 | tee "$LOG_PATH"

node "$REPO_ROOT/benchmarks/results/control-capture-cli.mjs" "$LOG_PATH" "$OUTPUT_PATH"

echo "JSC semantic-control capture: $OUTPUT_PATH"
echo "This file validates native measurement integrity only; it is not production-engine evidence."
