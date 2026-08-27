#!/usr/bin/env bash
set -euo pipefail

readonly QUICKJS_NG_TAG="v0.16.1"
readonly QUICKJS_NG_COMMIT="954dc53628e36891f93c359aa60895c2ae3dac6b"
readonly QUICKJS_NG_REPO="https://github.com/quickjs-ng/quickjs.git"
readonly NDK_VERSION="28.2.13676358"
readonly ANDROID_API="23"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly SOURCE_DIR="${CACHE_ROOT}/quickjs-ng-${QUICKJS_NG_TAG}"
readonly OUTPUT_ROOT="${1:?output jniLibs directory is required}"
readonly SHARED_NATIVE_DIR="$(cd "${SCRIPT_DIR}/../../quickjs/android/native" && pwd)"

if [[ "$(zig version 2>/dev/null || true)" != "0.16.0" ]]; then
  echo "error: Zig 0.16.0 is required for the QuickJS-NG Android candidate" >&2
  exit 1
fi

for tool in git cmake; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "error: ${tool} is required for the QuickJS-NG Android candidate" >&2
    exit 1
  fi
done

if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}/ndk/${NDK_VERSION}" ]]; then
  NDK_ROOT="${ANDROID_SDK_ROOT}/ndk/${NDK_VERSION}"
elif [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
  NDK_ROOT="${ANDROID_NDK_HOME}"
elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
  NDK_ROOT="${ANDROID_SDK_ROOT}/ndk/${NDK_VERSION}"
else
  echo "error: ANDROID_SDK_ROOT or ANDROID_NDK_HOME must point to an Android SDK/NDK" >&2
  exit 1
fi
readonly NDK_ROOT

if [[ ! -d "${NDK_ROOT}" ]]; then
  echo "error: Android NDK ${NDK_VERSION} was not found at ${NDK_ROOT}" >&2
  exit 1
fi

ndk_revision="$(sed -n 's/^Pkg\.Revision[[:space:]]*=[[:space:]]*//p' "${NDK_ROOT}/source.properties" | head -n 1)"
if [[ "${ndk_revision}" != "${NDK_VERSION}" ]]; then
  echo "error: Android NDK ${NDK_VERSION} is required; found ${ndk_revision:-unknown}" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) host_tag="linux-x86_64" ;;
  Darwin) host_tag="darwin-x86_64" ;;
  *) echo "error: unsupported Android native build host: $(uname -s)" >&2; exit 1 ;;
esac

readonly TOOLCHAIN="${NDK_ROOT}/toolchains/llvm/prebuilt/${host_tag}"
readonly SYSROOT="${TOOLCHAIN}/sysroot"
readonly CMAKE_TOOLCHAIN="${NDK_ROOT}/build/cmake/android.toolchain.cmake"

mkdir -p "${CACHE_ROOT}" "${OUTPUT_ROOT}"
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

build_abi() {
  local abi="$1"
  local triple="$2"
  local zig_target="$3"
  local cc="${TOOLCHAIN}/bin/${triple}${ANDROID_API}-clang"
  local work="${CACHE_ROOT}/build/quickjs-ng-android/${abi}"
  local cmake_build="${work}/cmake"
  local out="${OUTPUT_ROOT}/${abi}"

  rm -rf "${work}"
  mkdir -p "${cmake_build}" "${out}"

  cmake \
    -S "${SOURCE_DIR}" \
    -B "${cmake_build}" \
    -DCMAKE_TOOLCHAIN_FILE="${CMAKE_TOOLCHAIN}" \
    -DANDROID_ABI="${abi}" \
    -DANDROID_PLATFORM="android-${ANDROID_API}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DQJS_ENABLE_INSTALL=OFF \
    -DQJS_BUILD_EXAMPLES=OFF \
    -DQJS_BUILD_CLI_STATIC=OFF \
    -DQJS_BUILD_LIBC=OFF

  cmake --build "${cmake_build}" --target qjs --parallel
  local qjs_lib
  qjs_lib="$(find "${cmake_build}" -name 'libqjs.a' -type f | head -n 1)"
  if [[ -z "${qjs_lib}" ]]; then
    echo "error: QuickJS-NG static library was not produced for ${abi}" >&2
    exit 1
  fi

  # QuickJS-NG intentionally changes a few predicate return types from int to
  # bool while retaining the same embedding API shape. Keep the authoritative
  # Sting Zig host shared, but normalize only those predicate checks into a
  # generated candidate-local source file before compiling against NG headers.
  sed \
    -e 's/c\.JS_IsException(result) != 0/c.JS_IsException(result)/g' \
    -e 's/c\.JS_IsFunction(state.context, dispatch) == 0/!c.JS_IsFunction(state.context, dispatch)/g' \
    "${SHARED_NATIVE_DIR}/runtime.zig" > "${work}/runtime_quickjs_ng.zig"

  zig build-lib \
    "${work}/runtime_quickjs_ng.zig" \
    -static \
    -fPIC \
    -target "${zig_target}" \
    -OReleaseFast \
    -lc \
    -I"${SOURCE_DIR}" \
    -I"${SHARED_NATIVE_DIR}" \
    -I"${SYSROOT}/usr/include" \
    -I"${SYSROOT}/usr/include/${triple}" \
    -femit-bin="${work}/libsting_quickjs_ng_zig.a"

  sed \
    's/run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime/run_stingjs_runtime_candidates_quickjsng_QuickJsNgCandidateRuntime/g' \
    "${SHARED_NATIVE_DIR}/jni_adapter.c" > "${work}/jni_adapter_quickjs_ng.c"

  "${cc}" \
    -fPIC \
    -O2 \
    -I"${SHARED_NATIVE_DIR}" \
    -c "${work}/jni_adapter_quickjs_ng.c" \
    -o "${work}/jni_adapter.o"

  "${cc}" \
    -shared \
    -Wl,--no-undefined \
    -Wl,--exclude-libs,ALL \
    -o "${out}/libsting_quickjs_ng_android.so" \
    "${work}/jni_adapter.o" \
    "${work}/libsting_quickjs_ng_zig.a" \
    "${qjs_lib}" \
    -lm \
    -ldl
}

build_abi "arm64-v8a" "aarch64-linux-android" "aarch64-linux-android"
build_abi "x86_64" "x86_64-linux-android" "x86_64-linux-android"
