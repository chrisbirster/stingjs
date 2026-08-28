# Android native host distribution

Sting application builds must consume prebuilt native host artifacts. Zig is a runtime implementation/build dependency, not an application-development dependency.

## Producer boundary

Sting's source/release pipeline produces two Android AARs:

- `sting-runtime.aar` — Kotlin renderer, bridge, module registry, native object/view host, and Android runtime support.
- `sting-quickjs.aar` — the official QuickJS 2026-06-04 production adapter plus packaged `libsting_quickjs_android.so` native libraries.

The producer may use Zig, the Android NDK, and Sting repository source. `scripts/package-android-host.sh` owns that source-build step.

## Consumer boundary

An application consumes the two prebuilt AARs. It does not include Sting's runtime source projects and it does not run `build-android.sh` or Zig.

`tests/external/android-host` is the contract fixture. `scripts/test-android-distributable-host.sh` copies only the AARs and the application JavaScript bundle into that fixture, removes Zig from the consumer build PATH, and assembles the APK.

The fixture deliberately contains no `../../../native`, `../../../packages`, or runtime-source Gradle project mappings.

## Packaging rules

- official QuickJS is the only production engine packaged in the host artifacts.
- QuickJS-NG must not appear in the AAR or consumer APK.
- both arm64-v8a and x86_64 official QuickJS libraries are verified in CI today; release/device architecture expansion belongs to the same producer boundary.
- module AARs remain separate artifacts and will be connected by manifest-driven autolinking. They do not change the core host producer/consumer rule.

The current two-AAR artifact set establishes the binary boundary. Public Maven coordinates or npm-carried native artifacts may be layered on later without changing application/runtime semantics.
