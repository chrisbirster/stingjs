#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLATFORM="${1:-}"
ARTIFACT_DIR="${2:-$REPO_ROOT/release-artifacts/sting-go}"

if [[ -z "$PLATFORM" ]]; then
  echo "usage: $0 <android|ios> [artifact-dir]" >&2
  exit 2
fi

if [[ "$ARTIFACT_DIR" != /* ]]; then
  ARTIFACT_DIR="$REPO_ROOT/$ARTIFACT_DIR"
fi

VERSION="$(node -p 'require(process.argv[1]).version' "$REPO_ROOT/package.json")"
mkdir -p "$ARTIFACT_DIR"

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

write_metadata() {
  local platform="$1"
  local artifact="$2"
  local sha="$3"
  local filename
  filename="$(basename "$artifact")"
  node - "$ARTIFACT_DIR/sting-go-${platform}.json" "$VERSION" "$platform" "$filename" "$sha" <<'NODE'
const fs = require('node:fs');
const [output, version, platform, artifact, sha256] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify({
  schemaVersion: 1,
  product: 'sting-go',
  version,
  platform,
  artifact,
  sha256,
  releaseKind: 'developer-client',
}, null, 2)}\n`);
NODE
}

case "$PLATFORM" in
  android)
    if ! command -v gradle >/dev/null 2>&1; then
      echo "error: Gradle is required to package the Android Sting Go developer client" >&2
      exit 1
    fi

    (
      cd "$REPO_ROOT/apps/sting-go/android"
      gradle :app:assembleRelease --no-daemon
    )

    source_apk="$REPO_ROOT/apps/sting-go/android/app/build/outputs/apk/release/app-release.apk"
    test -f "$source_apk"

    # Sting Go must carry the accepted official QuickJS production runtime for
    # both physical ARM64 devices and the x86_64 emulator validation lane.
    unzip -l "$source_apk" | grep -F 'lib/arm64-v8a/libsting_quickjs_android.so' >/dev/null
    unzip -l "$source_apk" | grep -F 'lib/x86_64/libsting_quickjs_android.so' >/dev/null

    artifact="$ARTIFACT_DIR/sting-go-v${VERSION}-android-dev.apk"
    cp "$source_apk" "$artifact"
    sha="$(sha256_file "$artifact")"
    write_metadata android "$artifact" "$sha"
    ;;

  ios)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "error: iOS Sting Go developer-client packaging requires macOS/Xcode" >&2
      exit 1
    fi
    if ! command -v xcodebuild >/dev/null 2>&1; then
      echo "error: xcodebuild is required to package the iOS Sting Go developer client" >&2
      exit 1
    fi

    derived_data="${STING_GO_IOS_DERIVED_DATA:-$ARTIFACT_DIR/derived-data}"
    rm -rf "$derived_data"
    xcodebuild \
      -project "$REPO_ROOT/apps/sting-go/ios/StingGo.xcodeproj" \
      -scheme StingGo \
      -configuration Debug \
      -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$derived_data" \
      CODE_SIGNING_ALLOWED=NO \
      build

    source_app="$derived_data/Build/Products/Debug-iphonesimulator/StingGo.app"
    test -d "$source_app"

    artifact="$ARTIFACT_DIR/sting-go-v${VERSION}-ios-simulator.zip"
    rm -f "$artifact"
    (
      cd "$(dirname "$source_app")"
      ditto -c -k --sequesterRsrc --keepParent "$(basename "$source_app")" "$artifact"
    )
    sha="$(sha256_file "$artifact")"
    write_metadata ios-simulator "$artifact" "$sha"
    ;;

  *)
    echo "error: unsupported Sting Go platform '$PLATFORM'; expected android or ios" >&2
    exit 2
    ;;
esac

printf 'packaged Sting Go %s developer client in %s\n' "$PLATFORM" "$ARTIFACT_DIR"
