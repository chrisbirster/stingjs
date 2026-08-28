#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$REPO_ROOT/release-artifacts}"
if [[ "$ARTIFACT_DIR" != /* ]]; then
  ARTIFACT_DIR="$REPO_ROOT/$ARTIFACT_DIR"
fi
PACKAGE_DIR="$REPO_ROOT/tooling/create-sting"
RUNTIME_DIR="$PACKAGE_DIR/runtime"
ANDROID_RUNTIME_DIR="$RUNTIME_DIR/android"
IOS_RUNTIME_DIR="$RUNTIME_DIR/ios"
GRADLE_RUNTIME_DIR="$RUNTIME_DIR/gradle"
GRADLE_WRAPPER_URL="https://services.gradle.org/distributions/gradle-9.5.0-wrapper.jar"
GRADLE_WRAPPER_SHA256="497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7"

for input in \
  "$ARTIFACT_DIR/sting-runtime.aar" \
  "$ARTIFACT_DIR/sting-quickjs.aar" \
  "$ARTIFACT_DIR/sting-ios-host.zip"; do
  if [[ ! -f "$input" ]]; then
    echo "error: missing create-sting release input: $input" >&2
    exit 1
  fi
done

rm -rf "$RUNTIME_DIR"
mkdir -p "$ANDROID_RUNTIME_DIR" "$IOS_RUNTIME_DIR" "$GRADLE_RUNTIME_DIR"
cp "$ARTIFACT_DIR/sting-runtime.aar" "$ANDROID_RUNTIME_DIR/sting-runtime.aar"
cp "$ARTIFACT_DIR/sting-quickjs.aar" "$ANDROID_RUNTIME_DIR/sting-quickjs.aar"
unzip -q "$ARTIFACT_DIR/sting-ios-host.zip" -d "$IOS_RUNTIME_DIR"

test -f "$IOS_RUNTIME_DIR/StingQuickJSRuntime/Package.swift"
test -d "$IOS_RUNTIME_DIR/StingQuickJSRuntime/Artifacts/StingQuickJSBinary.xcframework"

wrapper_jar="$GRADLE_RUNTIME_DIR/gradle-wrapper.jar"
curl --fail --location --silent --show-error "$GRADLE_WRAPPER_URL" --output "$wrapper_jar"
actual_wrapper_sha="$(node -e 'const fs=require("node:fs");const crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$wrapper_jar")"
if [[ "$actual_wrapper_sha" != "$GRADLE_WRAPPER_SHA256" ]]; then
  echo "error: Gradle wrapper checksum mismatch: expected $GRADLE_WRAPPER_SHA256, got $actual_wrapper_sha" >&2
  exit 1
fi

npm install --prefix "$PACKAGE_DIR"
npm run build --prefix "$PACKAGE_DIR"

mkdir -p "$ARTIFACT_DIR"
(
  cd "$PACKAGE_DIR"
  npm pack --pack-destination "$ARTIFACT_DIR"
)

tarball="$(find "$ARTIFACT_DIR" -maxdepth 1 -type f -name 'create-sting-*.tgz' -print | sort | tail -n 1)"
if [[ -z "$tarball" ]]; then
  echo "error: npm pack did not produce a create-sting tarball" >&2
  exit 1
fi

for entry in \
  package/dist/cli.js \
  package/template/package.json.tpl \
  package/runtime/android/sting-runtime.aar \
  package/runtime/android/sting-quickjs.aar \
  package/runtime/ios/StingQuickJSRuntime/Package.swift \
  package/runtime/gradle/gradle-wrapper.jar; do
  if ! tar -tzf "$tarball" | grep -Fxq "$entry"; then
    echo "error: create-sting tarball is missing $entry" >&2
    exit 1
  fi
done

consumer_dir="$(mktemp -d)"
trap 'rm -rf "$consumer_dir"' EXIT
(
  cd "$consumer_dir"
  npm init --yes >/dev/null
  npm install "$tarball" --ignore-scripts >/dev/null
  node node_modules/create-sting/dist/cli.js generated-app \
    --name release-smoke \
    --android-package run.stingjs.release_smoke \
    --ios-bundle-identifier run.stingjs.release-smoke
)

test -f "$consumer_dir/generated-app/android/app/libs/sting-runtime.aar"
test -f "$consumer_dir/generated-app/android/app/libs/sting-quickjs.aar"
test -f "$consumer_dir/generated-app/android/gradle/wrapper/gradle-wrapper.jar"
test -f "$consumer_dir/generated-app/ios/StingQuickJSRuntime/Package.swift"
test -f "$consumer_dir/generated-app/ios/StingApp.xcodeproj/project.pbxproj"

printf 'packaged and smoke-tested publishable create-sting tarball:\n  %s\n' "$tarball"
