#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly STING_ANDROID="${ROOT}/examples/hello-world/android"
readonly OUTPUT_BASE="${STING_ANDROID_EVIDENCE_DIR:-${ROOT}/.artifacts/benchmarks/android-physical}"
readonly RN_VERSION="0.87.0"

fail() {
  echo "error: $*" >&2
  exit 1
}

for tool in adb git node npm gradle zig; do
  command -v "${tool}" >/dev/null 2>&1 || fail "${tool} is required"
done

[[ "$(zig version)" == "0.16.0" ]] || fail "Zig 0.16.0 is required; found $(zig version)"
[[ -n "${ANDROID_SDK_ROOT:-}" ]] || fail "ANDROID_SDK_ROOT must point to the Android SDK"
[[ -d "${ANDROID_SDK_ROOT}/ndk/28.2.13676358" ]] || \
  fail "Android NDK 28.2.13676358 must be installed under ANDROID_SDK_ROOT"

cd "${ROOT}"
readonly BENCHMARK_COMMIT="$(git rev-parse HEAD)"
[[ "${#BENCHMARK_COMMIT}" -eq 40 ]] || fail "unable to resolve a full benchmark commit"
if [[ -n "$(git status --porcelain)" ]]; then
  fail "physical evidence requires a clean worktree so benchmarkCommit exactly identifies the measured code"
fi

readonly DEVICE_LINES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
readonly DEVICE_COUNT="$(printf '%s\n' "${DEVICE_LINES}" | awk 'NF { count += 1 } END { print count + 0 }')"
[[ "${DEVICE_COUNT}" -eq 1 ]] || \
  fail "exactly one authorized Android device must be connected; found ${DEVICE_COUNT}"
readonly DEVICE="$(printf '%s\n' "${DEVICE_LINES}" | awk 'NF { print; exit }')"
readonly IS_EMULATOR="$(adb -s "${DEVICE}" shell getprop ro.kernel.qemu | tr -d '\r')"
[[ "${IS_EMULATOR}" != "1" ]] || fail "Android emulator detected; final v0.1 evidence requires a physical device"
readonly DEVICE_MODEL="$(adb -s "${DEVICE}" shell getprop ro.product.manufacturer | tr -d '\r') $(adb -s "${DEVICE}" shell getprop ro.product.model | tr -d '\r')"
readonly DEVICE_API="$(adb -s "${DEVICE}" shell getprop ro.build.version.sdk | tr -d '\r')"

echo "Physical Android device: ${DEVICE_MODEL} (API ${DEVICE_API})"
echo "Benchmark commit: ${BENCHMARK_COMMIT}"

readonly OUTPUT_ROOT="${OUTPUT_BASE}/${BENCHMARK_COMMIT}"
readonly CAPTURE_DIR="${OUTPUT_ROOT}/captures"
readonly EVIDENCE_DIR="${OUTPUT_ROOT}/evidence"
readonly RN_DIR="${OUTPUT_ROOT}/react-native-${RN_VERSION}/StingRNBenchmark"
rm -rf "${OUTPUT_ROOT}"
mkdir -p "${CAPTURE_DIR}" "${EVIDENCE_DIR}"

npm install
npm run build --workspace @stingjs/example-hello-world
npm run build --workspace @stingjs/benchmark-native

run_sting_candidate() {
  local engine="$1"
  local remote_name="sting-${engine}-android.json"
  local local_capture="${CAPTURE_DIR}/${remote_name}"

  adb -s "${DEVICE}" shell rm -rf "/sdcard/Android/data/run.stingjs.helloworld/files/sting-benchmarks" || true
  adb -s "${DEVICE}" shell am instrument -w -r \
    -e class run.stingjs.helloworld.PhysicalEvidenceInstrumentedTest \
    -e stingEngine "${engine}" \
    -e benchmarkCommit "${BENCHMARK_COMMIT}" \
    run.stingjs.helloworld.test/androidx.test.runner.AndroidJUnitRunner

  adb -s "${DEVICE}" pull \
    "/sdcard/Android/data/run.stingjs.helloworld/files/sting-benchmarks/${remote_name}" \
    "${local_capture}" >/dev/null
  [[ -s "${local_capture}" ]] || fail "missing ${engine} capture after instrumentation"
  npm run benchmark:import-evidence -- "${local_capture}" "${EVIDENCE_DIR}"
}

echo "Building Sting Release app with both QuickJS candidates..."
(
  cd "${STING_ANDROID}"
  gradle :app:assembleRelease :app:assembleAndroidTest --no-daemon
)

readonly STING_APP_APK="$(find "${STING_ANDROID}/app/build/outputs/apk/release" -name '*.apk' -type f | head -n 1)"
readonly STING_TEST_APK="$(find "${STING_ANDROID}/app/build/outputs/apk/androidTest" -name '*.apk' -type f | head -n 1)"
[[ -f "${STING_APP_APK}" ]] || fail "Sting Release APK was not produced"
[[ -f "${STING_TEST_APK}" ]] || fail "Sting instrumentation APK was not produced"

adb -s "${DEVICE}" uninstall run.stingjs.helloworld >/dev/null 2>&1 || true
adb -s "${DEVICE}" uninstall run.stingjs.helloworld.test >/dev/null 2>&1 || true
adb -s "${DEVICE}" install -r "${STING_APP_APK}" >/dev/null
adb -s "${DEVICE}" install -r "${STING_TEST_APK}" >/dev/null

run_sting_candidate quickjs
run_sting_candidate quickjs-ng

adb -s "${DEVICE}" uninstall run.stingjs.helloworld.test >/dev/null 2>&1 || true
adb -s "${DEVICE}" uninstall run.stingjs.helloworld >/dev/null 2>&1 || true

echo "Generating pinned React Native 0.87 + Hermes baseline..."
STING_RN_BASELINE_DIR="${RN_DIR}" bash "${ROOT}/benchmarks/react-native-benchmark/scripts/generate.sh"
(
  cd "${RN_DIR}/android"
  ./gradlew :app:assembleRelease :app:assembleAndroidTest --no-daemon
)

readonly RN_APP_APK="$(find "${RN_DIR}/android/app/build/outputs/apk/release" -name '*.apk' -type f | head -n 1)"
readonly RN_TEST_APK="$(find "${RN_DIR}/android/app/build/outputs/apk/androidTest" -name '*.apk' -type f | head -n 1)"
[[ -f "${RN_APP_APK}" ]] || fail "React Native Release APK was not produced"
[[ -f "${RN_TEST_APK}" ]] || fail "React Native instrumentation APK was not produced"

adb -s "${DEVICE}" uninstall com.stingrnbenchmark >/dev/null 2>&1 || true
adb -s "${DEVICE}" uninstall com.stingrnbenchmark.test >/dev/null 2>&1 || true
adb -s "${DEVICE}" install -r "${RN_APP_APK}" >/dev/null
adb -s "${DEVICE}" install -r "${RN_TEST_APK}" >/dev/null
adb -s "${DEVICE}" shell rm -rf "/sdcard/Android/data/com.stingrnbenchmark/files/sting-benchmarks" || true

adb -s "${DEVICE}" shell am instrument -w -r \
  -e class com.stingrnbenchmark.PhysicalEvidenceInstrumentedTest \
  -e benchmarkCommit "${BENCHMARK_COMMIT}" \
  com.stingrnbenchmark.test/androidx.test.runner.AndroidJUnitRunner

readonly RN_CAPTURE="${CAPTURE_DIR}/react-native-hermes-android.json"
adb -s "${DEVICE}" pull \
  "/sdcard/Android/data/com.stingrnbenchmark/files/sting-benchmarks/react-native-hermes-android.json" \
  "${RN_CAPTURE}" >/dev/null
[[ -s "${RN_CAPTURE}" ]] || fail "missing React Native/Hermes capture after instrumentation"
npm run benchmark:import-evidence -- "${RN_CAPTURE}" "${EVIDENCE_DIR}"

adb -s "${DEVICE}" uninstall com.stingrnbenchmark.test >/dev/null 2>&1 || true
adb -s "${DEVICE}" uninstall com.stingrnbenchmark >/dev/null 2>&1 || true

npm run benchmark:results -- validate "${EVIDENCE_DIR}"
npm run benchmark:results -- summarize "${EVIDENCE_DIR}" > "${OUTPUT_ROOT}/summary.json"

echo
echo "Physical Android evidence collection complete."
echo "Device:    ${DEVICE_MODEL}"
echo "Commit:    ${BENCHMARK_COMMIT}"
echo "Captures:  ${CAPTURE_DIR}"
echo "Evidence:  ${EVIDENCE_DIR}"
echo "Summary:   ${OUTPUT_ROOT}/summary.json"
echo
echo "Review the evidence before copying it into benchmarks/results/raw/."
