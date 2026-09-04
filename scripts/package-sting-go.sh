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

    unzip -l "$source_apk" | grep -F 'lib/arm64-v8a/libsting_quickjs_android.so' >/dev/null
    unzip -l "$source_apk" | grep -F 'lib/x86_64/libsting_quickjs_android.so' >/dev/null

    artifact="$ARTIFACT_DIR/sting-go-v${VERSION}-android-dev.apk"
    cp "$source_apk" "$artifact"
    sha="$(sha256_file "$artifact")"
    write_metadata android "$artifact" "$sha"
    ;;

  ios)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "error: iOS Sting Go developer-client packaging requires macOS" >&2
      exit 1
    fi

    source_app="${STING_GO_IOS_APP:-}"
    if [[ -n "$source_app" ]]; then
      if [[ "$source_app" != /* ]]; then
        source_app="$REPO_ROOT/$source_app"
      fi
      if [[ ! -d "$source_app" ]]; then
        echo "error: STING_GO_IOS_APP does not point to a built StingGo.app: $source_app" >&2
        exit 1
      fi
    else
      if ! command -v xcodebuild >/dev/null 2>&1; then
        echo "error: xcodebuild is required to build the iOS Sting Go developer client" >&2
        exit 1
      fi

      derived_data="${STING_GO_IOS_DERIVED_DATA:-$ARTIFACT_DIR/derived-data}"
      rm -rf "$derived_data"
      rm -rf \
        "$REPO_ROOT/apps/sting-go/ios/Support/.build" \
        "$REPO_ROOT/native/ios/.build" \
        "$REPO_ROOT/native/ios/QuickJSRuntime/.build" \
        "$REPO_ROOT/packages/modules/haptics/.build" \
        "$REPO_ROOT/packages/modules/clipboard/.build"

      xcodebuild \
        -project "$REPO_ROOT/apps/sting-go/ios/StingGo.xcodeproj" \
        -scheme StingGo \
        -configuration Debug \
        -sdk iphonesimulator \
        -destination 'generic/platform=iOS Simulator' \
        -derivedDataPath "$derived_data" \
        CODE_SIGNING_ALLOWED=NO \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGN_IDENTITY= \
        clean build

      source_app="$derived_data/Build/Products/Debug-iphonesimulator/StingGo.app"
    fi

    test -d "$source_app"
    test -f "$source_app/Info.plist"
    bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$source_app/Info.plist")"
    if [[ "$bundle_id" != "run.stingjs.go" ]]; then
      echo "error: unexpected Sting Go bundle identifier '$bundle_id' in $source_app" >&2
      exit 1
    fi

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
