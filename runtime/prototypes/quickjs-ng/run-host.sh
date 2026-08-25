#!/usr/bin/env bash
set -euo pipefail

readonly QUICKJS_NG_TAG="v0.16.1"
readonly QUICKJS_NG_COMMIT="954dc53628e36891f93c359aa60895c2ae3dac6b"
readonly QUICKJS_NG_REPO="https://github.com/quickjs-ng/quickjs.git"
readonly PROTOTYPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${PROTOTYPE_DIR}/../../.." && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly SOURCE_DIR="${CACHE_ROOT}/quickjs-ng-${QUICKJS_NG_TAG}"
readonly BUILD_DIR="${CACHE_ROOT}/build/quickjs-ng-${QUICKJS_NG_TAG}"
readonly STAGED_SOURCE_DIR="${BUILD_DIR}/sting-host-src"
readonly ENGINE_OUTPUT="${BUILD_DIR}/sting-quickjs-ng-engine-bench"
readonly STING_OUTPUT="${BUILD_DIR}/sting-quickjs-ng-sting-smoke"
readonly ASYNC_OUTPUT="${BUILD_DIR}/sting-quickjs-ng-async-smoke"
readonly APP_BUNDLE="${REPO_ROOT}/examples/hello-world/dist/sting-app.js"
readonly BENCHMARK_BUNDLE="${REPO_ROOT}/benchmarks/sting-benchmark/dist/sting-benchmark.js"
readonly ASYNC_BUNDLE="${REPO_ROOT}/examples/async-native/dist/sting-async-native.js"
readonly ASYNC_SEMANTICS="${REPO_ROOT}/runtime/prototypes/shared/async_semantics.js"

if ! command -v zig >/dev/null 2>&1; then
  echo "error: Zig 0.16.0 is required for this prototype" >&2
  exit 1
fi

if [[ "$(zig version)" != "0.16.0" ]]; then
  echo "error: expected Zig 0.16.0, found $(zig version)" >&2
  exit 1
fi

for tool in git cmake; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "error: ${tool} is required for this prototype" >&2
    exit 1
  fi
done

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required to build the real Sting application bundles" >&2
  exit 1
fi

mkdir -p "${CACHE_ROOT}"

if [[ ! -d "${SOURCE_DIR}/.git" ]]; then
  rm -rf "${SOURCE_DIR}"
  git init -q "${SOURCE_DIR}"
  git -C "${SOURCE_DIR}" remote add origin "${QUICKJS_NG_REPO}"
fi

git -C "${SOURCE_DIR}" fetch --depth 1 --force origin "refs/tags/${QUICKJS_NG_TAG}"
git -C "${SOURCE_DIR}" checkout -q --detach FETCH_HEAD

actual_commit="$(git -C "${SOURCE_DIR}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${QUICKJS_NG_COMMIT}" ]]; then
  echo "error: QuickJS-NG tag resolved to unexpected commit" >&2
  echo "expected: ${QUICKJS_NG_COMMIT}" >&2
  echo "actual:   ${actual_commit}" >&2
  exit 1
fi

cmake \
  -S "${SOURCE_DIR}" \
  -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DQJS_ENABLE_INSTALL=OFF \
  -DQJS_BUILD_EXAMPLES=OFF \
  -DQJS_BUILD_CLI_STATIC=OFF

cmake --build "${BUILD_DIR}" --target qjs --parallel

cd "${REPO_ROOT}"
npm run build --workspace @stingjs/example-hello-world
npm run build --workspace @stingjs/benchmark-native
npm run build --workspace @stingjs/example-async-native

mkdir -p "${STAGED_SOURCE_DIR}"
cp "${PROTOTYPE_DIR}/src/main.zig" "${STAGED_SOURCE_DIR}/main.zig"
cp "${PROTOTYPE_DIR}/src/sting_smoke.zig" "${STAGED_SOURCE_DIR}/sting_smoke.zig"
cp "${PROTOTYPE_DIR}/src/async_smoke.zig" "${STAGED_SOURCE_DIR}/async_smoke.zig"
cp "${REPO_ROOT}/benchmarks/js-engine/engine-bench.js" "${STAGED_SOURCE_DIR}/engine-bench.js"
cp "${APP_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-app.js"
cp "${BENCHMARK_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-benchmark.js"
cp "${ASYNC_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-async-native.js"
cp "${ASYNC_SEMANTICS}" "${STAGED_SOURCE_DIR}/sting-async-semantics.js"

if [[ "$(uname -s)" == "Darwin" ]]; then
  sed -i '' 's/c\.stderr/c.stderr()/g' \
    "${STAGED_SOURCE_DIR}/main.zig" \
    "${STAGED_SOURCE_DIR}/sting_smoke.zig" \
    "${STAGED_SOURCE_DIR}/async_smoke.zig"
fi

link_args=(
  -lc
  -lm
  -lpthread
)

if [[ "$(uname -s)" != "Darwin" ]]; then
  link_args+=( -ldl )
fi

zig build-exe \
  "${STAGED_SOURCE_DIR}/main.zig" \
  -I"${SOURCE_DIR}" \
  -L"${BUILD_DIR}" \
  -lqjs \
  "${link_args[@]}" \
  -OReleaseFast \
  -femit-bin="${ENGINE_OUTPUT}"

zig build-exe \
  "${STAGED_SOURCE_DIR}/sting_smoke.zig" \
  -I"${SOURCE_DIR}" \
  -L"${BUILD_DIR}" \
  -lqjs \
  "${link_args[@]}" \
  -OReleaseFast \
  -femit-bin="${STING_OUTPUT}"

zig build-exe \
  "${STAGED_SOURCE_DIR}/async_smoke.zig" \
  -I"${SOURCE_DIR}" \
  -L"${BUILD_DIR}" \
  -lqjs \
  "${link_args[@]}" \
  -OReleaseFast \
  -femit-bin="${ASYNC_OUTPUT}"

"${ENGINE_OUTPUT}"
"${STING_OUTPUT}"
exec "${ASYNC_OUTPUT}"
