#!/usr/bin/env bash
set -euo pipefail

readonly RN_VERSION="0.87.0"
readonly CLI_VERSION="20.2.0"
readonly HERMES_COMPILER_VERSION="250829098.0.16"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BENCHMARK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly OUTPUT_DIR="${STING_RN_BASELINE_DIR:-${CACHE_ROOT}/react-native-${RN_VERSION}/StingRNBenchmark}"
readonly PHYSICAL_TEST_TEMPLATE="${BENCHMARK_DIR}/android/PhysicalEvidenceInstrumentedTest.kt.template"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "error: Node.js 22+ and npm are required" >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 22 )); then
  echo "error: React Native 0.87 requires Node.js 22+, found $(node --version)" >&2
  exit 1
fi

rm -rf "${OUTPUT_DIR}"
mkdir -p "$(dirname "${OUTPUT_DIR}")"

npx --yes "@react-native-community/cli@${CLI_VERSION}" init StingRNBenchmark \
  --version "${RN_VERSION}" \
  --directory "${OUTPUT_DIR}" \
  --pm npm \
  --install-pods false \
  --skip-git-init true

cp "${BENCHMARK_DIR}/App.tsx" "${OUTPUT_DIR}/App.tsx"

# Add a release-targeted Android instrumentation test without changing the RN
# benchmark component implementation. The test observes actual native TextView
# commits from outside React Native.
env \
  STING_RN_BASELINE_DIR="${OUTPUT_DIR}" \
  STING_RN_PHYSICAL_TEST_TEMPLATE="${PHYSICAL_TEST_TEMPLATE}" \
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.STING_RN_BASELINE_DIR;
const gradlePath = path.join(root, 'android/app/build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

const namespace =
  gradle.match(/namespace\s+["']([^"']+)["']/)?.[1] ??
  gradle.match(/namespace\s*=\s*["']([^"']+)["']/)?.[1];
if (!namespace) throw new Error('unable to resolve generated Android namespace');

if (!gradle.includes('testInstrumentationRunner')) {
  gradle = gradle.replace(
    /defaultConfig\s*\{\n/,
    match => `${match}        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"\n`,
  );
}
if (!gradle.includes('testBuildType "release"')) {
  gradle = gradle.replace(
    /\n\s*buildTypes\s*\{/,
    '\n    testBuildType "release"\n\n    buildTypes {',
  );
}
if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(gradle)) {
  gradle = gradle.replace(
    /release\s*\{\n/,
    match => `${match}            signingConfig signingConfigs.debug\n`,
  );
}
if (!gradle.includes('androidx.test.ext:junit:1.3.0')) {
  gradle += `\n\ndependencies {\n` +
    `    androidTestImplementation("androidx.test:core:1.7.0")\n` +
    `    androidTestImplementation("androidx.test:runner:1.7.0")\n` +
    `    androidTestImplementation("androidx.test.ext:junit:1.3.0")\n` +
    `}\n`;
}
fs.writeFileSync(gradlePath, gradle);

const template = fs.readFileSync(process.env.STING_RN_PHYSICAL_TEST_TEMPLATE, 'utf8');
const testSource = template.replaceAll('__PACKAGE__', namespace);
const packagePath = namespace.split('.');
const testDir = path.join(root, 'android/app/src/androidTest/java', ...packagePath);
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, 'PhysicalEvidenceInstrumentedTest.kt'), testSource);
NODE

# Do not reuse the readonly shell variable names as temporary command
# assignments. Bash treats `RN_VERSION=... node` as an attempted assignment to
# the readonly variable before starting the child process. Give the verification
# process distinct environment names instead.
env \
  STING_RN_BASELINE_DIR="${OUTPUT_DIR}" \
  EXPECTED_RN_VERSION="${RN_VERSION}" \
  EXPECTED_HERMES_COMPILER_VERSION="${HERMES_COMPILER_VERSION}" \
  node <<'NODE'
const path = require('node:path');
const root = process.env.STING_RN_BASELINE_DIR;
const reactNative = require(path.join(root, 'node_modules/react-native/package.json'));
const hermesCompiler = require(path.join(root, 'node_modules/hermes-compiler/package.json'));
const app = require(path.join(root, 'package.json'));

if (reactNative.version !== process.env.EXPECTED_RN_VERSION) {
  throw new Error(
    `expected react-native ${process.env.EXPECTED_RN_VERSION}, found ${reactNative.version}`,
  );
}
if (hermesCompiler.version !== process.env.EXPECTED_HERMES_COMPILER_VERSION) {
  throw new Error(
    `expected hermes-compiler ${process.env.EXPECTED_HERMES_COMPILER_VERSION}, found ${hermesCompiler.version}`,
  );
}
if (app.dependencies?.expo) {
  throw new Error('React Native reference must remain a bare app without Expo');
}

console.log(
  JSON.stringify({
    baseline: 'react-native',
    reactNative: reactNative.version,
    react: app.dependencies?.react,
    hermesCompiler: hermesCompiler.version,
    packageManager: 'npm',
    directory: root,
  }),
);
NODE

echo "React Native baseline generated at ${OUTPUT_DIR}"
