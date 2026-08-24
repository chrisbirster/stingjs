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
readonly OUTPUT="${BUILD_DIR}/sting-hermes-engine-bench"

if ! command -v zig >/dev/null 2>&1; then
  echo "error: Zig 0.16.0 is required for this prototype" >&2
  exit 1
fi

if [[ "$(zig version)" != "0.16.0" ]]; then
  echo "error: expected Zig 0.16.0, found $(zig version)" >&2
  exit 1
fi

for tool in git cmake ninja python3; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "error: ${tool} is required for this prototype" >&2
    exit 1
  fi
done

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

cmake \
  -S "${PROTOTYPE_DIR}" \
  -B "${BUILD_DIR}" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DHERMES_SOURCE_DIR="${SOURCE_DIR}"

cmake --build "${BUILD_DIR}" --target sting_hermes_adapter --parallel 2

hermes_library="$(find "${BUILD_DIR}/hermes" -type f -name 'libhermesvm.so' -print -quit)"
if [[ -z "${hermes_library}" ]]; then
  echo "error: Hermes shared VM library was not produced" >&2
  exit 1
fi
readonly HERMES_LIB_DIR="$(dirname "${hermes_library}")"

mkdir -p "${STAGED_SOURCE_DIR}"
cp "${PROTOTYPE_DIR}/src/main.zig" "${STAGED_SOURCE_DIR}/main.zig"
cp "${REPO_ROOT}/benchmarks/js-engine/engine-bench.js" "${STAGED_SOURCE_DIR}/engine-bench.js"

zig build-exe \
  "${STAGED_SOURCE_DIR}/main.zig" \
  -I"${PROTOTYPE_DIR}/include" \
  -L"${BUILD_DIR}" \
  -L"${HERMES_LIB_DIR}" \
  -lsting_hermes_adapter \
  -lc \
  -OReleaseFast \
  -femit-bin="${OUTPUT}"

if [[ "$(uname -s)" == "Darwin" ]]; then
  export DYLD_LIBRARY_PATH="${BUILD_DIR}:${HERMES_LIB_DIR}:${DYLD_LIBRARY_PATH:-}"
else
  export LD_LIBRARY_PATH="${BUILD_DIR}:${HERMES_LIB_DIR}:${LD_LIBRARY_PATH:-}"
fi

exec "${OUTPUT}"
