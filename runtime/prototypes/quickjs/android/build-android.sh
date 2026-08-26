#!/usr/bin/env bash
set -euo pipefail

readonly QUICKJS_VERSION="2026-06-04"
readonly QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
readonly NDK_VERSION="28.2.13676358"
readonly ANDROID_API="23"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROTOTYPE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly ARCHIVE="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly SOURCE_DIR="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}"
readonly OUTPUT_ROOT="${1:?output jniLibs directory is required}"
readonly NATIVE_DIR="${SCRIPT_DIR}/native"

if [[ "$(zig version 2>/dev/null || true)" != "0.16.0" ]]; then
  echo "error: Zig 0.16.0 is required for the official QuickJS Android candidate" >&2
  exit 1
fi

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

readonly NDK_SOURCE_PROPERTIES="${NDK_ROOT}/source.properties"
if [[ ! -f "${NDK_SOURCE_PROPERTIES}" ]]; then
  echo "error: Android NDK source.properties was not found at ${NDK_SOURCE_PROPERTIES}" >&2
  exit 1
fi

ndk_revision="$(sed -n 's/^Pkg\.Revision[[:space:]]*=[[:space:]]*//p' "${NDK_SOURCE_PROPERTIES}" | head -n 1)"
if [[ "${ndk_revision}" != "${NDK_VERSION}" ]]; then
  echo "error: Android NDK ${NDK_VERSION} is required; found ${ndk_revision:-unknown} at ${NDK_ROOT}" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) host_tag="linux-x86_64" ;;
  Darwin) host_tag="darwin-x86_64" ;;
  *) echo "error: unsupported Android native build host: $(uname -s)" >&2; exit 1 ;;
esac

readonly TOOLCHAIN="${NDK_ROOT}/toolchains/llvm/prebuilt/${host_tag}"
readonly SYSROOT="${TOOLCHAIN}/sysroot"
readonly AR="${TOOLCHAIN}/bin/llvm-ar"

mkdir -p "${CACHE_ROOT}" "${OUTPUT_ROOT}"

if [[ ! -f "${ARCHIVE}" ]]; then
  curl --fail --location --silent --show-error "${QUICKJS_URL}" --output "${ARCHIVE}"
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual_sha256="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
else
  actual_sha256="$(shasum -a 256 "${ARCHIVE}" | awk '{print $1}')"
fi
if [[ "${actual_sha256}" != "${QUICKJS_SHA256}" ]]; then
  echo "error: QuickJS archive checksum mismatch" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  tar -xJf "${ARCHIVE}" -C "${CACHE_ROOT}"
fi

build_abi() {
  local abi="$1"
  local triple="$2"
  local zig_target="$3"
  local cc="${TOOLCHAIN}/bin/${triple}${ANDROID_API}-clang"
  local work="${CACHE_ROOT}/build/official-quickjs-android/${abi}"
  local out="${OUTPUT_ROOT}/${abi}"

  rm -rf "${work}"
  mkdir -p "${work}" "${out}"

  local common_cflags=(
    -fPIC
    -O2
    -D_GNU_SOURCE
    "-DCONFIG_VERSION=\"${QUICKJS_VERSION}\""
    -I"${SOURCE_DIR}"
  )

  local objects=()
  local source
  for source in quickjs.c libregexp.c libunicode.c cutils.c dtoa.c; do
    local object="${work}/${source%.c}.o"
    "${cc}" "${common_cflags[@]}" -c "${SOURCE_DIR}/${source}" -o "${object}"
    objects+=("${object}")
  done
  "${AR}" rcs "${work}/libquickjs.a" "${objects[@]}"

  zig build-lib \
    "${NATIVE_DIR}/runtime.zig" \
    -static \
    -fPIC \
    -target "${zig_target}" \
    -OReleaseFast \
    -lc \
    -I"${SOURCE_DIR}" \
    -I"${NATIVE_DIR}" \
    -I"${SYSROOT}/usr/include" \
    -I"${SYSROOT}/usr/include/${triple}" \
    -femit-bin="${work}/libsting_quickjs_zig.a"

  "${cc}" \
    -fPIC \
    -O2 \
    -I"${NATIVE_DIR}" \
    -c "${NATIVE_DIR}/jni_adapter.c" \
    -o "${work}/jni_adapter.o"

  "${cc}" \
    -shared \
    -Wl,--no-undefined \
    -Wl,--exclude-libs,ALL \
    -o "${out}/libsting_quickjs_android.so" \
    "${work}/jni_adapter.o" \
    "${work}/libsting_quickjs_zig.a" \
    "${work}/libquickjs.a" \
    -lm \
    -ldl
}

build_abi "arm64-v8a" "aarch64-linux-android" "aarch64-linux-android"
build_abi "x86_64" "x86_64-linux-android" "x86_64-linux-android"
