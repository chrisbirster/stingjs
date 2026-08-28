#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$REPO_ROOT/dist/android-host}"
FIXTURE_DIR="$REPO_ROOT/tests/external/android-host"
APP_DIR="$FIXTURE_DIR/app"
GRADLE_BIN="${GRADLE_BIN:-$(command -v gradle || true)}"

if [[ -z "$GRADLE_BIN" ]]; then
  echo "error: Gradle is required to verify the Android host consumer" >&2
  exit 1
fi

for artifact in sting-runtime.aar sting-quickjs.aar; do
  if [[ ! -f "$ARTIFACT_DIR/$artifact" ]]; then
    echo "error: missing Android host artifact: $ARTIFACT_DIR/$artifact" >&2
    exit 1
  fi
done

if [[ ! -f "$REPO_ROOT/examples/hello-world/dist/sting-app.js" ]]; then
  echo "error: build @stingjs/example-hello-world before running the external Android host smoke" >&2
  exit 1
fi

rm -rf "$APP_DIR/libs" "$APP_DIR/src/main/assets" "$FIXTURE_DIR/.gradle" "$APP_DIR/build"
mkdir -p "$APP_DIR/libs" "$APP_DIR/src/main/assets"
cp "$ARTIFACT_DIR/sting-runtime.aar" "$APP_DIR/libs/sting-runtime.aar"
cp "$ARTIFACT_DIR/sting-quickjs.aar" "$APP_DIR/libs/sting-quickjs.aar"
cp "$REPO_ROOT/examples/hello-world/dist/sting-app.js" "$APP_DIR/src/main/assets/sting-app.js"

if grep -R -n -E '\.\./\.\./\.\./(native|packages|runtime)/' "$FIXTURE_DIR" --exclude-dir=.gradle --exclude='*.aar'; then
  echo "error: external Android consumer must not reference Sting monorepo source paths" >&2
  exit 1
fi

# The producer is allowed to use Zig. The consumer is not. Preserve the
# resolved Gradle executable and normal Java/system tools, but deliberately
# drop the setup-zig tool-cache directory (and other user tool bins) from PATH.
gradle_dir="$(cd "$(dirname "$GRADLE_BIN")" && pwd)"
consumer_path="$gradle_dir"
if [[ -n "${JAVA_HOME:-}" ]]; then
  consumer_path="$consumer_path:$JAVA_HOME/bin"
fi
consumer_path="$consumer_path:/usr/bin:/bin"

if env PATH="$consumer_path" sh -c 'command -v zig >/dev/null 2>&1'; then
  echo "error: Zig unexpectedly remains available in the external Android consumer PATH" >&2
  exit 1
fi

(
  cd "$FIXTURE_DIR"
  env PATH="$consumer_path" "$GRADLE_BIN" :app:assembleDebug --no-daemon
)

apk="$APP_DIR/build/outputs/apk/debug/app-debug.apk"
test -f "$apk"
unzip -l "$apk" | grep -F 'lib/arm64-v8a/libsting_quickjs_android.so' >/dev/null
unzip -l "$apk" | grep -F 'lib/x86_64/libsting_quickjs_android.so' >/dev/null
if unzip -l "$apk" | grep -Fq 'libsting_quickjs_ng_android.so'; then
  echo "error: QuickJS-NG must not be packaged in the external Android consumer" >&2
  exit 1
fi

printf 'external Android host consumer built without Zig: %s\n' "$apk"
