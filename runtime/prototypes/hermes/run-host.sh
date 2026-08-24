#!/usr/bin/env bash
set -euo pipefail

readonly HERMES_TAG="hermes-v250829098.0.16"
readonly HERMES_COMMIT="90f23852efcd361315688e2904d2446707fa274c"
readonly HERMES_REPO="https://github.com/facebook/hermes.git"
readonly PROTOTYPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${PROTOTYPE_DIR}/../../.." && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly SOURCE_DIR="${CACHE_ROOT}/${HERMES_TAG}"
readonly BUILD_DIR="${CACHE_ROOT}/build/${HERMES_TAG}"
readonly STAGED_SOURCE_DIR="${BUILD_DIR}/sting-zig-src"
readonly ENGINE_OUTPUT="${BUILD_DIR}/sting-hermes-engine-bench"
readonly STING_OUTPUT="${BUILD_DIR}/sting-hermes-sting-smoke"
readonly APP_BUNDLE="${REPO_ROOT}/examples/hello-world/dist/sting-app.js"
readonly BENCHMARK_BUNDLE="${REPO_ROOT}/benchmarks/sting-benchmark/dist/sting-benchmark.js"

if ! command -v zig >/dev/null 2>&1; then
  echo "error: Zig 0.16.0 is required for this prototype" >&2
  exit 1
fi

if [[ "$(zig version)" != "0.16.0" ]]; then
  echo "error: expected Zig 0.16.0, found $(zig version)" >&2
  exit 1
fi

for tool in git cmake python3; do
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
  git -C "${SOURCE_DIR}" remote add origin "${HERMES_REPO}"
fi

git -C "${SOURCE_DIR}" fetch --depth 1 --force origin "refs/tags/${HERMES_TAG}"
git -C "${SOURCE_DIR}" checkout -q --detach FETCH_HEAD

actual_commit="$(git -C "${SOURCE_DIR}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${HERMES_COMMIT}" ]]; then
  echo "error: Hermes tag resolved to unexpected commit" >&2
  echo "expected: ${HERMES_COMMIT}" >&2
  echo "actual:   ${actual_commit}" >&2
  exit 1
fi

# Prefer Ninja when it is already installed, but do not require it. Use an
# explicit generator branch instead of an optionally empty Bash array because
# stock macOS Bash 3.2 treats an empty array expansion as unbound under `set -u`.
if command -v ninja >/dev/null 2>&1; then
  desired_generator="Ninja"
else
  desired_generator="Unix Makefiles"
fi

if [[ -f "${BUILD_DIR}/CMakeCache.txt" ]]; then
  cached_generator="$(sed -n 's/^CMAKE_GENERATOR:INTERNAL=//p' "${BUILD_DIR}/CMakeCache.txt" | head -n 1)"
  if [[ -n "${cached_generator}" && "${cached_generator}" != "${desired_generator}" ]]; then
    rm -rf "${BUILD_DIR}"
  fi
fi

if [[ "${desired_generator}" == "Ninja" ]]; then
  cmake \
    -S "${PROTOTYPE_DIR}" \
    -B "${BUILD_DIR}" \
    -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DHERMES_SOURCE_DIR="${SOURCE_DIR}"
else
  cmake \
    -S "${PROTOTYPE_DIR}" \
    -B "${BUILD_DIR}" \
    -G "Unix Makefiles" \
    -DCMAKE_BUILD_TYPE=Release \
    -DHERMES_SOURCE_DIR="${SOURCE_DIR}"
fi

cmake --build "${BUILD_DIR}" --target sting_hermes_adapter --parallel 2

hermes_library="$(find "${BUILD_DIR}/hermes" -type f \( -name 'libhermesvm.so' -o -name 'libhermesvm.dylib' \) -print -quit)"
if [[ -z "${hermes_library}" ]]; then
  echo "error: Hermes shared VM library was not produced" >&2
  exit 1
fi
readonly HERMES_LIB_DIR="$(dirname "${hermes_library}")"

cd "${REPO_ROOT}"
npm run build --workspace @stingjs/example-hello-world
npm run build --workspace @stingjs/benchmark-native

mkdir -p "${STAGED_SOURCE_DIR}"
cp "${PROTOTYPE_DIR}/src/main.zig" "${STAGED_SOURCE_DIR}/main.zig"
cp "${PROTOTYPE_DIR}/src/sting_smoke.zig" "${STAGED_SOURCE_DIR}/sting_smoke.zig"
cp "${REPO_ROOT}/benchmarks/js-engine/engine-bench.js" "${STAGED_SOURCE_DIR}/engine-bench.js"
cp "${APP_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-app.js"
cp "${BENCHMARK_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-benchmark.js"

# Zig 0.16's Darwin libc translation exposes stderr as an inline accessor,
# while glibc exposes it as a FILE pointer. Normalize only the staged prototype
# sources so Linux CI and macOS local testing use the same checked-in sources.
if [[ "$(uname -s)" == "Darwin" ]]; then
  sed -i '' 's/c\.stderr/c.stderr()/g' \
    "${STAGED_SOURCE_DIR}/main.zig" \
    "${STAGED_SOURCE_DIR}/sting_smoke.zig"
fi

zig build-exe \
  "${STAGED_SOURCE_DIR}/main.zig" \
  -I"${PROTOTYPE_DIR}/include" \
  -L"${BUILD_DIR}" \
  -L"${HERMES_LIB_DIR}" \
  -lsting_hermes_adapter \
  -lc \
  -OReleaseFast \
  -femit-bin="${ENGINE_OUTPUT}"

zig build-exe \
  "${STAGED_SOURCE_DIR}/sting_smoke.zig" \
  -I"${PROTOTYPE_DIR}/include" \
  -L"${BUILD_DIR}" \
  -L"${HERMES_LIB_DIR}" \
  -lsting_hermes_adapter \
  -lc \
  -OReleaseFast \
  -femit-bin="${STING_OUTPUT}"

if [[ "$(uname -s)" == "Darwin" ]]; then
  export DYLD_LIBRARY_PATH="${BUILD_DIR}:${HERMES_LIB_DIR}:${DYLD_LIBRARY_PATH:-}"
else
  export LD_LIBRARY_PATH="${BUILD_DIR}:${HERMES_LIB_DIR}:${LD_LIBRARY_PATH:-}"
fi

"${ENGINE_OUTPUT}"
exec "${STING_OUTPUT}"
