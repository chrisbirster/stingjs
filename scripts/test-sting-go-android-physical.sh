#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly STING_GO_ANDROID="${ROOT}/apps/sting-go/android"
readonly PORT="${STING_GO_PHYSICAL_PORT:-8081}"
readonly OUTPUT_BASE="${STING_GO_PHYSICAL_EVIDENCE_DIR:-${ROOT}/.artifacts/sting-go/android-physical}"

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
readonly COMMIT="$(git rev-parse HEAD)"
[[ "${#COMMIT}" -eq 40 ]] || fail "unable to resolve a full commit SHA"
if [[ -n "$(git status --porcelain)" ]]; then
  fail "physical Sting Go evidence requires a clean worktree"
fi

readonly DEVICE_LINES="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
readonly DEVICE_COUNT="$(printf '%s\n' "${DEVICE_LINES}" | awk 'NF { count += 1 } END { print count + 0 }')"
[[ "${DEVICE_COUNT}" -eq 1 ]] || \
  fail "exactly one authorized Android device must be connected; found ${DEVICE_COUNT}"
readonly DEVICE="$(printf '%s\n' "${DEVICE_LINES}" | awk 'NF { print; exit }')"
readonly IS_EMULATOR="$(adb -s "${DEVICE}" shell getprop ro.kernel.qemu | tr -d '\r')"
[[ "${IS_EMULATOR}" != "1" ]] || fail "Android emulator detected; this harness requires a physical device"

readonly DEVICE_MANUFACTURER="$(adb -s "${DEVICE}" shell getprop ro.product.manufacturer | tr -d '\r')"
readonly DEVICE_MODEL="$(adb -s "${DEVICE}" shell getprop ro.product.model | tr -d '\r')"
readonly DEVICE_API="$(adb -s "${DEVICE}" shell getprop ro.build.version.sdk | tr -d '\r')"
readonly OUTPUT_DIR="${OUTPUT_BASE}/${COMMIT}"
readonly SERVER_LOG="${OUTPUT_DIR}/sting-server.log"
readonly RESULT_JSON="${OUTPUT_DIR}/result.json"
mkdir -p "${OUTPUT_DIR}"

SERVER_PID=""
cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  adb -s "${DEVICE}" reverse --remove "tcp:${PORT}" >/dev/null 2>&1 || true
  adb -s "${DEVICE}" uninstall run.stingjs.go.test >/dev/null 2>&1 || true
  adb -s "${DEVICE}" uninstall run.stingjs.go >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Physical Android Sting Go device: ${DEVICE_MANUFACTURER} ${DEVICE_MODEL} (API ${DEVICE_API})"
echo "Commit: ${COMMIT}"

npm install
npm run build --workspace @stingjs/example-hello-world
(
  cd "${ROOT}/tooling/cli"
  npm install
  npm run build
)

(
  cd "${STING_GO_ANDROID}"
  gradle :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon
)

readonly APP_APK="$(find "${STING_GO_ANDROID}/app/build/outputs/apk/debug" -name '*.apk' -type f | head -n 1)"
readonly TEST_APK="$(find "${STING_GO_ANDROID}/app/build/outputs/apk/androidTest" -name '*.apk' -type f | head -n 1)"
[[ -f "${APP_APK}" ]] || fail "Sting Go debug APK was not produced"
[[ -f "${TEST_APK}" ]] || fail "Sting Go instrumentation APK was not produced"

adb -s "${DEVICE}" uninstall run.stingjs.go.test >/dev/null 2>&1 || true
adb -s "${DEVICE}" uninstall run.stingjs.go >/dev/null 2>&1 || true
adb -s "${DEVICE}" install -r "${APP_APK}" >/dev/null
adb -s "${DEVICE}" install -r "${TEST_APK}" >/dev/null
adb -s "${DEVICE}" reverse "tcp:${PORT}" "tcp:${PORT}"

node "${ROOT}/tooling/cli/dist/cli.js" start \
  --project-root "${ROOT}/examples/hello-world" \
  --host 127.0.0.1 \
  --port "${PORT}" \
  --no-qr \
  >"${SERVER_LOG}" 2>&1 &
SERVER_PID="$!"

readonly MANIFEST_URL="http://127.0.0.1:${PORT}/manifest"
for _ in $(seq 1 60); do
  if node -e 'fetch(process.argv[1]).then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))' "http://127.0.0.1:${PORT}/health"; then
    break
  fi
  sleep 0.25
done
node -e 'fetch(process.argv[1]).then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))' \
  "http://127.0.0.1:${PORT}/health" || fail "Sting development server did not become healthy"

readonly DEEP_LINK="$(node -e 'process.stdout.write(`sting://go?url=${encodeURIComponent(process.argv[1])}`)' "${MANIFEST_URL}")"

# Exercise the real exported VIEW intent path before instrumentation performs
# the stronger native-render + live-reload assertions.
adb -s "${DEVICE}" shell am start -W \
  -a android.intent.action.VIEW \
  -d "${DEEP_LINK}" \
  run.stingjs.go >/dev/null

adb -s "${DEVICE}" shell am instrument -w -r \
  -e class run.stingjs.go.StingGoPhysicalDeviceInstrumentedTest \
  -e stingGoManifestUrl "${MANIFEST_URL}" \
  run.stingjs.go.test/androidx.test.runner.AndroidJUnitRunner

node - "${RESULT_JSON}" "${COMMIT}" "${DEVICE}" "${DEVICE_MANUFACTURER}" "${DEVICE_MODEL}" "${DEVICE_API}" "${MANIFEST_URL}" <<'NODE'
import { writeFileSync } from 'node:fs';

const [path, commit, serial, manufacturer, model, api, manifestUrl] = process.argv.slice(2);
writeFileSync(path, `${JSON.stringify({
  kind: 'sting-go-android-physical',
  commit,
  device: { serial, manufacturer, model, apiLevel: Number(api) },
  manifestUrl,
  transport: 'adb-reverse',
  assertions: {
    osDeepLinkLaunch: true,
    solidNativeRender: 'Count: 0',
    reloadStreamState: 'Live',
  },
}, null, 2)}\n`);
NODE

echo
echo "Physical Android Sting Go validation passed."
echo "Device:   ${DEVICE_MANUFACTURER} ${DEVICE_MODEL} (API ${DEVICE_API})"
echo "Commit:   ${COMMIT}"
echo "Evidence: ${RESULT_JSON}"
echo "Server:   ${SERVER_LOG}"
