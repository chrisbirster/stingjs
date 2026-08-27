#!/usr/bin/env bash
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly BENCH_DIR="${ROOT}/benchmarks/transport"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly OUTPUT_ROOT="${STING_TRANSPORT_OUTPUT_DIR:-${ROOT}/.artifacts/benchmarks/transport}"
readonly WORK_ROOT="${CACHE_ROOT}/build/sting-transport-benchmark"
readonly QUICKJS_VERSION="2026-06-04"
readonly QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
readonly QUICKJS_ARCHIVE="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly QUICKJS_SOURCE="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}"
readonly QUICKJS_NG_TAG="v0.16.1"
readonly QUICKJS_NG_COMMIT="954dc53628e36891f93c359aa60895c2ae3dac6b"
readonly QUICKJS_NG_REPO="https://github.com/quickjs-ng/quickjs.git"
readonly QUICKJS_NG_SOURCE="${CACHE_ROOT}/quickjs-ng-${QUICKJS_NG_TAG}"
readonly QUICKJS_NG_BUILD="${WORK_ROOT}/quickjs-ng-build"

fail() {
  echo "error: $*" >&2
  exit 1
}

for tool in zig git cmake make node curl; do
  command -v "${tool}" >/dev/null 2>&1 || fail "${tool} is required"
done
[[ "$(zig version)" == "0.16.0" ]] || fail "Zig 0.16.0 is required; found $(zig version)"

mkdir -p "${CACHE_ROOT}" "${WORK_ROOT}" "${OUTPUT_ROOT}"

if [[ ! -f "${QUICKJS_ARCHIVE}" ]]; then
  curl --fail --location --silent --show-error "${QUICKJS_URL}" --output "${QUICKJS_ARCHIVE}"
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual_sha256="$(sha256sum "${QUICKJS_ARCHIVE}" | awk '{print $1}')"
else
  actual_sha256="$(shasum -a 256 "${QUICKJS_ARCHIVE}" | awk '{print $1}')"
fi
[[ "${actual_sha256}" == "${QUICKJS_SHA256}" ]] || fail "QuickJS archive checksum mismatch"
if [[ ! -d "${QUICKJS_SOURCE}" ]]; then
  tar -xJf "${QUICKJS_ARCHIVE}" -C "${CACHE_ROOT}"
fi
make -C "${QUICKJS_SOURCE}" libquickjs.a >/dev/null

if [[ ! -d "${QUICKJS_NG_SOURCE}/.git" ]]; then
  rm -rf "${QUICKJS_NG_SOURCE}"
  git init -q "${QUICKJS_NG_SOURCE}"
  git -C "${QUICKJS_NG_SOURCE}" remote add origin "${QUICKJS_NG_REPO}"
fi
git -C "${QUICKJS_NG_SOURCE}" fetch --depth 1 --force origin "refs/tags/${QUICKJS_NG_TAG}" >/dev/null
git -C "${QUICKJS_NG_SOURCE}" checkout -q --detach FETCH_HEAD
actual_ng_commit="$(git -C "${QUICKJS_NG_SOURCE}" rev-parse HEAD)"
[[ "${actual_ng_commit}" == "${QUICKJS_NG_COMMIT}" ]] || fail "QuickJS-NG tag resolved to unexpected commit"

rm -rf "${QUICKJS_NG_BUILD}"
cmake \
  -S "${QUICKJS_NG_SOURCE}" \
  -B "${QUICKJS_NG_BUILD}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DQJS_ENABLE_INSTALL=OFF \
  -DQJS_BUILD_EXAMPLES=OFF \
  -DQJS_BUILD_CLI_STATIC=OFF \
  -DQJS_BUILD_LIBC=OFF >/dev/null
cmake --build "${QUICKJS_NG_BUILD}" --target qjs --parallel >/dev/null
readonly QUICKJS_NG_LIB="$(find "${QUICKJS_NG_BUILD}" -name 'libqjs.a' -type f | head -n 1)"
[[ -f "${QUICKJS_NG_LIB}" ]] || fail "QuickJS-NG static library was not produced"

link_args=( -lc -lm -lpthread )
if [[ "$(uname -s)" != "Darwin" ]]; then
  link_args+=( -ldl )
fi

stage_source() {
  local engine="$1"
  local target="$2"
  sed "s/__STING_ENGINE__/${engine}/g" "${BENCH_DIR}/quickjs_transport_bench.zig" > "${target}"
  cp "${BENCH_DIR}/transport-bench.js" "$(dirname "${target}")/transport-bench.js"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' 's/c\.stderr/c.stderr()/g' "${target}"
  fi
}

build_and_run_official() {
  local work="${WORK_ROOT}/quickjs"
  rm -rf "${work}"
  mkdir -p "${work}"
  local source="${work}/quickjs_transport_bench.zig"
  local binary="${work}/transport-bench"
  stage_source quickjs "${source}"
  zig build-exe \
    "${source}" \
    -I"${QUICKJS_SOURCE}" \
    -L"${QUICKJS_SOURCE}" \
    -lquickjs \
    "${link_args[@]}" \
    -OReleaseFast \
    -femit-bin="${binary}"
  "${binary}" | tee "${OUTPUT_ROOT}/quickjs.log"
}

build_and_run_ng() {
  local work="${WORK_ROOT}/quickjs-ng"
  rm -rf "${work}"
  mkdir -p "${work}"
  local source="${work}/quickjs_transport_bench.zig"
  local binary="${work}/transport-bench"
  stage_source quickjs-ng "${source}"
  sed \
    -e 's/c\.JS_IsException(result) != 0/c.JS_IsException(result)/g' \
    -e 's/c\.JS_IsJobPending(runtime) != 0/c.JS_IsJobPending(runtime)/g' \
    "${source}" > "${source}.ng"
  mv "${source}.ng" "${source}"
  zig build-exe \
    "${source}" \
    -I"${QUICKJS_NG_SOURCE}" \
    -L"$(dirname "${QUICKJS_NG_LIB}")" \
    -lqjs \
    "${link_args[@]}" \
    -OReleaseFast \
    -femit-bin="${binary}"
  "${binary}" | tee "${OUTPUT_ROOT}/quickjs-ng.log"
}

rm -f "${OUTPUT_ROOT}/quickjs.log" "${OUTPUT_ROOT}/quickjs-ng.log" "${OUTPUT_ROOT}/summary.json"
build_and_run_official
build_and_run_ng
node "${BENCH_DIR}/summarize.mjs" \
  "${OUTPUT_ROOT}/quickjs.log" \
  "${OUTPUT_ROOT}/quickjs-ng.log" > "${OUTPUT_ROOT}/summary.json"

echo
echo "Transport benchmark complete."
echo "Raw logs: ${OUTPUT_ROOT}/quickjs.log"
echo "          ${OUTPUT_ROOT}/quickjs-ng.log"
echo "Summary:  ${OUTPUT_ROOT}/summary.json"
echo "Classification: diagnostic-host-transport (not physical engine-selection evidence)"
