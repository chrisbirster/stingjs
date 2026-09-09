#!/usr/bin/env bash
set -euo pipefail

readonly QUICKJS_VERSION="2026-06-04"
readonly QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
readonly PROTOTYPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${PROTOTYPE_DIR}/../../.." && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly ARCHIVE="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly SOURCE_DIR="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}"
readonly OUTPUT_DIR="${CACHE_ROOT}/build/official-quickjs"
readonly STAGED_SOURCE_DIR="${OUTPUT_DIR}/src"
readonly ENGINE_OUTPUT="${OUTPUT_DIR}/sting-quickjs-engine-bench"
readonly STING_OUTPUT="${OUTPUT_DIR}/sting-quickjs-sting-smoke"
readonly ASYNC_OUTPUT="${OUTPUT_DIR}/sting-quickjs-async-smoke"
readonly TRANSPORT_OUTPUT="${OUTPUT_DIR}/sting-quickjs-transport-bench"
readonly APP_BUNDLE="${REPO_ROOT}/examples/hello-world/dist/sting-app.js"
readonly BENCHMARK_BUNDLE="${REPO_ROOT}/benchmarks/sting-benchmark/dist/sting-benchmark.js"
readonly ASYNC_BUNDLE="${REPO_ROOT}/examples/async-native/dist/sting-async-native.js"
readonly ASYNC_SEMANTICS="${REPO_ROOT}/runtime/prototypes/shared/async_semantics.js"
readonly CONFORMANCE_BUNDLE="${REPO_ROOT}/benchmarks/solid2-conformance/dist/sting-solid2-conformance.js"
readonly CONFORMANCE_SEMANTICS="${REPO_ROOT}/runtime/prototypes/shared/conformance_semantics.js"

if ! command -v zig >/dev/null 2>&1; then echo "error: Zig 0.16.0 is required for this prototype" >&2; exit 1; fi
if [[ "$(zig version)" != "0.16.0" ]]; then echo "error: expected Zig 0.16.0, found $(zig version)" >&2; exit 1; fi
if ! command -v npm >/dev/null 2>&1; then echo "error: npm is required to build the real Sting application bundles" >&2; exit 1; fi

mkdir -p "${CACHE_ROOT}" "${OUTPUT_DIR}" "${STAGED_SOURCE_DIR}"
if [[ ! -f "${ARCHIVE}" ]]; then curl --fail --location --silent --show-error "${QUICKJS_URL}" --output "${ARCHIVE}"; fi
if command -v sha256sum >/dev/null 2>&1; then actual_sha256="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"; else actual_sha256="$(shasum -a 256 "${ARCHIVE}" | awk '{print $1}')"; fi
if [[ "${actual_sha256}" != "${QUICKJS_SHA256}" ]]; then echo "error: QuickJS archive checksum mismatch" >&2; echo "expected: ${QUICKJS_SHA256}" >&2; echo "actual:   ${actual_sha256}" >&2; exit 1; fi
if [[ ! -d "${SOURCE_DIR}" ]]; then tar -xJf "${ARCHIVE}" -C "${CACHE_ROOT}"; fi
make -C "${SOURCE_DIR}" libquickjs.a

cd "${REPO_ROOT}"
npm run build --workspace @stingjs/example-hello-world
npm run build --workspace @stingjs/benchmark-native
npm run build --workspace @stingjs/example-async-native
npm run build --workspace @stingjs/solid2-conformance

cp "${PROTOTYPE_DIR}/src/main.zig" "${STAGED_SOURCE_DIR}/main.zig"
cp "${PROTOTYPE_DIR}/src/sting_smoke.zig" "${STAGED_SOURCE_DIR}/sting_smoke.zig"
cp "${PROTOTYPE_DIR}/src/async_smoke.zig" "${STAGED_SOURCE_DIR}/async_smoke.zig"
cp "${PROTOTYPE_DIR}/src/transport_bench.zig" "${STAGED_SOURCE_DIR}/transport_bench.zig"
cp "${PROTOTYPE_DIR}/src/transport-bench.js" "${STAGED_SOURCE_DIR}/transport-bench.js"
cp "${REPO_ROOT}/benchmarks/js-engine/engine-bench.js" "${STAGED_SOURCE_DIR}/engine-bench.js"
cp "${APP_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-app.js"
cp "${BENCHMARK_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-benchmark.js"
cp "${ASYNC_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-async-native.js"
cp "${ASYNC_SEMANTICS}" "${STAGED_SOURCE_DIR}/sting-async-semantics.js"
cp "${CONFORMANCE_BUNDLE}" "${STAGED_SOURCE_DIR}/sting-solid2-conformance.js"
cp "${CONFORMANCE_SEMANTICS}" "${STAGED_SOURCE_DIR}/sting-conformance-semantics.js"

if [[ "$(uname -s)" == "Darwin" ]]; then
  sed -i '' 's/c\.stderr/c.stderr()/g' "${STAGED_SOURCE_DIR}/main.zig" "${STAGED_SOURCE_DIR}/sting_smoke.zig" "${STAGED_SOURCE_DIR}/async_smoke.zig" "${STAGED_SOURCE_DIR}/transport_bench.zig"
fi

link_args=( -lc -lm -lpthread )
if [[ "$(uname -s)" != "Darwin" ]]; then link_args+=( -ldl ); fi

zig build-exe "${STAGED_SOURCE_DIR}/main.zig" -I"${SOURCE_DIR}" -L"${SOURCE_DIR}" -lquickjs "${link_args[@]}" -OReleaseFast -femit-bin="${ENGINE_OUTPUT}"
zig build-exe "${STAGED_SOURCE_DIR}/sting_smoke.zig" -I"${SOURCE_DIR}" -L"${SOURCE_DIR}" -lquickjs "${link_args[@]}" -OReleaseFast -femit-bin="${STING_OUTPUT}"
zig build-exe "${STAGED_SOURCE_DIR}/async_smoke.zig" -I"${SOURCE_DIR}" -L"${SOURCE_DIR}" -lquickjs "${link_args[@]}" -OReleaseFast -femit-bin="${ASYNC_OUTPUT}"
zig build-exe "${STAGED_SOURCE_DIR}/transport_bench.zig" -I"${SOURCE_DIR}" -L"${SOURCE_DIR}" -lquickjs "${link_args[@]}" -OReleaseFast -femit-bin="${TRANSPORT_OUTPUT}"

"${ENGINE_OUTPUT}"
"${STING_OUTPUT}"
"${TRANSPORT_OUTPUT}"
exec "${ASYNC_OUTPUT}"
