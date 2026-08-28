#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_ROOT/dist/android-host}"
ANDROID_PROJECT="$REPO_ROOT/examples/hello-world/android"
GRADLE_BIN="${GRADLE_BIN:-$(command -v gradle || true)}"

if [[ -z "$GRADLE_BIN" ]]; then
  echo "error: Gradle is required to produce the Android host artifacts" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/sting-runtime.aar" "$OUTPUT_DIR/sting-quickjs.aar"

(
  cd "$ANDROID_PROJECT"
  "$GRADLE_BIN" \
    :sting-runtime:assembleRelease \
    :sting-runtime-quickjs-candidate:assembleRelease \
    --no-daemon
)

runtime_aar="$(find "$REPO_ROOT/native/android/build/outputs/aar" -maxdepth 1 -type f -name '*release.aar' -print -quit)"
quickjs_aar="$(find "$REPO_ROOT/runtime/prototypes/quickjs/android/build/outputs/aar" -maxdepth 1 -type f -name '*release.aar' -print -quit)"

if [[ -z "$runtime_aar" || ! -f "$runtime_aar" ]]; then
  echo "error: Sting Android runtime release AAR was not produced" >&2
  exit 1
fi
if [[ -z "$quickjs_aar" || ! -f "$quickjs_aar" ]]; then
  echo "error: official QuickJS Android release AAR was not produced" >&2
  exit 1
fi

cp "$runtime_aar" "$OUTPUT_DIR/sting-runtime.aar"
cp "$quickjs_aar" "$OUTPUT_DIR/sting-quickjs.aar"

unzip -l "$OUTPUT_DIR/sting-quickjs.aar" | grep -F 'arm64-v8a/libsting_quickjs_android.so' >/dev/null
unzip -l "$OUTPUT_DIR/sting-quickjs.aar" | grep -F 'x86_64/libsting_quickjs_android.so' >/dev/null
if unzip -l "$OUTPUT_DIR/sting-quickjs.aar" | grep -Fq 'libsting_quickjs_ng_android.so'; then
  echo "error: QuickJS-NG must not be present in the distributable Android host" >&2
  exit 1
fi

printf 'packaged Android host artifacts:\n  %s\n  %s\n' \
  "$OUTPUT_DIR/sting-runtime.aar" \
  "$OUTPUT_DIR/sting-quickjs.aar"
