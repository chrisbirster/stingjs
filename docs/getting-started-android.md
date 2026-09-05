# Android contributor runtime proof

This page documents the repository-level Android runtime proof. It is **not** the normal application-author setup path.

For a published StingJS release, application authors create a project with `npm create sting@latest` (or `npm create sting@next` for an RC), install dependencies, run `npx sting doctor`, and use `npx sting run android`. Ordinary generated application builds consume distributable Sting native host artifacts and do not require Zig or a Sting source checkout.

StingJS Android renders real Android Views. It does not use a WebView, React Native renderer, or Expo runtime.

The repository proof path is:

```text
Solid TSX
  -> Vite/Solid compiler
  -> dist/sting-app.js
  -> Android application assets
  -> official QuickJS 2026-06-04
  -> Zig/C/JNI Sting boundary
  -> Kotlin Sting bridge
  -> Android native Views
```

Official QuickJS is the accepted production JavaScript engine. QuickJS-specific values, JNI objects, Kotlin views, and Zig implementation details do not cross the public application API.

## Repository proof requirements

These requirements are for building Sting itself from source, not for an ordinary generated application:

- Node.js 22.12+
- npm 12.0.2
- JDK 17
- Android SDK 36 / build-tools 36.0.0
- Android NDK `28.2.13676358`
- Zig 0.16.0
- Gradle 9.5.0

## Build the shared Solid bundle

From the repository root:

```bash
npm install
npm run build --workspace @stingjs/example-hello-world
```

The generated `examples/hello-world/dist/sting-app.js` is packaged into the Android application assets.

## Build the repository Android proof

```bash
cd examples/hello-world/android
gradle :app:assembleDebug --no-daemon
```

For the release smoke artifact used by CI:

```bash
gradle :app:assembleRelease --no-daemon
```

## Native instrumentation

With an emulator or device available:

```bash
gradle :app:connectedDebugAndroidTest :sting-runtime:connectedDebugAndroidTest --no-daemon
```

The tests prove real Android controls, including native event -> JavaScript/Solid -> precise native mutation, Haptics module routing, fine-grained mutation counts, and native Image/TextInput/ScrollView behavior.

CI runs the instrumentation on an Android 36 x86_64 emulator. Physical-device performance evidence is collected separately and is never inferred from emulator results.

## Architecture note

Application code imports only Sting/Solid APIs. See `docs/architecture.md`, `docs/how-sting-runs.md`, and `docs/primitives.md` for the implementation boundary.
