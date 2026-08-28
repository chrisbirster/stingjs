#!/usr/bin/env bash
set -euo pipefail

readonly QUICKJS_VERSION="2026-06-04"
readonly QUICKJS_URL="https://bellard.org/quickjs/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly QUICKJS_SHA256="b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a"
readonly MIN_IOS_VERSION="16.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CACHE_ROOT="${STING_RUNTIME_CACHE:-${TMPDIR:-/tmp}/stingjs-runtime}"
readonly ARCHIVE="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}.tar.xz"
readonly SOURCE_DIR="${CACHE_ROOT}/quickjs-${QUICKJS_VERSION}"
readonly NATIVE_DIR="${SCRIPT_DIR}/native"
readonly OUTPUT_DIR="${1:-${SCRIPT_DIR}/build/simulator}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: official QuickJS iOS runtime must be built on macOS" >&2
  exit 1
fi

if [[ "$(zig version 2>/dev/null || true)" != "0.16.0" ]]; then
  echo "error: Zig 0.16.0 is required to build the Sting QuickJS iOS runtime from source" >&2
  exit 1
fi

readonly SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
readonly CC="$(xcrun --sdk iphonesimulator --find clang)"
readonly LIBTOOL="$(xcrun --find libtool)"
readonly HOST_ARCH="$(uname -m)"

case "${HOST_ARCH}" in
  arm64)
    readonly CLANG_ARCH="arm64"
    readonly ZIG_TARGET="aarch64-ios-simulator"
    ;;
  x86_64)
    readonly CLANG_ARCH="x86_64"
    readonly ZIG_TARGET="x86_64-ios-simulator"
    ;;
  *)
    echo "error: unsupported macOS runner architecture: ${HOST_ARCH}" >&2
    exit 1
    ;;
esac

mkdir -p "${CACHE_ROOT}" "${OUTPUT_DIR}"

if [[ ! -f "${ARCHIVE}" ]]; then
  curl --fail --location --silent --show-error "${QUICKJS_URL}" --output "${ARCHIVE}"
fi

actual_sha256="$(shasum -a 256 "${ARCHIVE}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${QUICKJS_SHA256}" ]]; then
  echo "error: QuickJS archive checksum mismatch" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  tar -xJf "${ARCHIVE}" -C "${CACHE_ROOT}"
fi

readonly WORK="${CACHE_ROOT}/build/official-quickjs-ios/${HOST_ARCH}"
rm -rf "${WORK}"
mkdir -p "${WORK}" "${OUTPUT_DIR}"

common_cflags=(
  -arch "${CLANG_ARCH}"
  -isysroot "${SDK}"
  "-mios-simulator-version-min=${MIN_IOS_VERSION}"
  -fPIC
  -O2
  -D_GNU_SOURCE
  "-DCONFIG_VERSION=\"${QUICKJS_VERSION}\""
  -I"${SOURCE_DIR}"
)

objects=()
for source in quickjs.c libregexp.c libunicode.c cutils.c dtoa.c; do
  object="${WORK}/${source%.c}.o"
  "${CC}" "${common_cflags[@]}" -c "${SOURCE_DIR}/${source}" -o "${object}"
  objects+=("${object}")
done
"${LIBTOOL}" -static -o "${WORK}/libquickjs.a" "${objects[@]}"

# Zig 0.16's Aro C translator does not reliably discover the iPhone Simulator
# SDK's libc headers from a sysroot. Apple clang already owns that SDK contract,
# so resolve all includes and target conditionals there first. Zig then
# translates ordinary preprocessed C declarations and never has to locate
# <stdio.h>, <stdint.h>, or Darwin's nested system headers itself.
cat > "${WORK}/quickjs_c.h" <<'EOF'
#include "quickjs.h"
#include "sting_quickjs_android.h"
EOF

"${CC}" \
  -E \
  -P \
  -x c \
  -arch "${CLANG_ARCH}" \
  -isysroot "${SDK}" \
  "-mios-simulator-version-min=${MIN_IOS_VERSION}" \
  -D_GNU_SOURCE \
  -I"${SOURCE_DIR}" \
  -I"${NATIVE_DIR}" \
  "${WORK}/quickjs_c.h" \
  > "${WORK}/quickjs_preprocessed.c"

# translate-c dispatches its frontend from the input extension in Zig 0.16.
# Keep the already-preprocessed translation unit named as C instead of `.i` so
# Aro parses the resolved declarations without trying to rediscover SDK headers.
zig translate-c \
  -target "${ZIG_TARGET}" \
  "${WORK}/quickjs_preprocessed.c" \
  > "${WORK}/quickjs_c.zig"

# Full preprocessing intentionally removes macro definitions. On 64-bit
# QuickJS, JSValueConst is a macro alias for JSValue, and JS_EVAL_TYPE_GLOBAL is
# a consumed integer macro. Restore those two names at the generated-binding
# boundary while leaving all translated declarations and inline APIs untouched.
printf '\npub const JSValueConst = JSValue;\npub const JS_EVAL_TYPE_GLOBAL: c_int = 0;\n' >> "${WORK}/quickjs_c.zig"

# Keep one canonical runtime implementation. The checked-in runtime still uses
# @cImport for the existing Android source-build path; this temporary iOS copy
# replaces only that four-line import block with the generated Zig module.
{
  printf 'const c = @import("quickjs_c.zig");\n\n'
  tail -n +5 "${NATIVE_DIR}/runtime.zig"
} > "${WORK}/runtime.zig"

zig build-lib \
  "${WORK}/runtime.zig" \
  -static \
  -fPIC \
  -target "${ZIG_TARGET}" \
  -OReleaseFast \
  -lc \
  --sysroot "${SDK}" \
  -femit-bin="${WORK}/libsting_quickjs_zig.a"

# Keep the app-facing link input to one archive. QuickJS and the Sting/Zig
# runtime remain independently built above, then libtool combines their object
# members without introducing a C/C++ runtime layer.
"${LIBTOOL}" -static \
  -o "${OUTPUT_DIR}/libsting_quickjs_ios.a" \
  "${WORK}/libsting_quickjs_zig.a" \
  "${WORK}/libquickjs.a"

printf 'built %s for %s (%s)\n' \
  "${OUTPUT_DIR}/libsting_quickjs_ios.a" \
  "${ZIG_TARGET}" \
  "${QUICKJS_VERSION}"
