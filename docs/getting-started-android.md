# Getting started on Android

StingJS Android renders real Android Views. It does not use a WebView, React Native renderer, or Expo runtime.

The v0.1 hello-world path is:

```text
Solid TSX
  -> Vite/Solid compiler
  -> dist/sting-app.js
  -> Android application assets
  -> Sting candidate JS runtime
  -> Zig/C/JNI boundary
  -> Kotlin Sting bridge
  -> Android View/Text/Button controls
```

The current Android proof host uses the official QuickJS candidate while the final production-engine ADR remains blocked on physical-device evidence. That implementation detail is not an application API promise.

## Requirements

- Node.js 22.12+
- npm 12.0.2
- JDK 17
- Android SDK 36 / build-tools 36.0.0
- Android NDK `28.2.13676358`
- Zig 0.16.0
- Gradle 9.5.0 (CI pins this through the setup action)

## Build the shared Solid bundle

From the repository root:

```bash
npm install
npm run build --workspace @stingjs/example-hello-world
```

The generated `examples/hello-world/dist/sting-app.js` is packaged into the Android application assets.

## Build Android

```bash
cd examples/hello-world/android
gradle :app:assembleDebug --no-daemon
```

The build also compiles the Android QuickJS/Zig candidate runtime for the supported ABIs.

For the unsigned release smoke artifact used by CI:

```bash
gradle :app:assembleRelease --no-daemon
```

## Native instrumentation

With an emulator/device available:

```bash
gradle :app:connectedDebugAndroidTest :sting-runtime:connectedDebugAndroidTest --no-daemon
```

The tests prove real Android controls, including:

- native button -> JavaScript/Solid -> native text,
- native Haptics module routing,
- fine-grained text mutation counts,
- `Image`, controlled `TextInput`, and `ScrollView` platform parity.

CI runs the same instrumentation on an Android 36 x86_64 emulator and separately verifies an Android release APK can be built.

## Architecture note

Application code imports only Sting/Solid APIs. QuickJS-specific values, JNI objects, Kotlin views, and Zig implementation details do not cross the public renderer contract. See `docs/architecture.md`, `docs/how-sting-runs.md`, and `docs/primitives.md`.
