# Sting doctor

`sting doctor` validates both the local developer environment and the current Sting application.

```bash
sting doctor
sting doctor ios
sting doctor android
sting doctor --runtime
sting doctor android --project-root ./examples/hello-world --json
```

## Application checks

For a normal Sting application, doctor checks:

- Node >= 22.12
- npm
- `package.json`
- `@stingjs/solid`
- a Solid 2-compatible `solid-js` declaration
- a `build` script
- `sting.config.ts` validity when present
- configured or inferred native project paths

A project without `sting.config.ts` remains valid; the CLI reports that project inference will be used.

With no explicit target, doctor detects iOS and Android from the Sting config or conventional `ios/` and `android/` directories.

## iOS mode

`sting doctor ios` is an explicit iOS gate. It requires macOS, Xcode, and `simctl`, and verifies the configured/inferred iOS project path.

When plain `sting doctor` discovers an iOS target while running on another operating system, the iOS toolchain check is reported as skipped. This lets a multi-platform project continue Android development on Linux or Windows without pretending that iOS can be built there.

## Android mode

`sting doctor android` makes the Android toolchain required:

- Java 17 or newer
- `ANDROID_SDK_ROOT` or `ANDROID_HOME`
- adb
- configured/inferred Android project directory

A project-local Gradle wrapper is preferred. If neither `gradlew` nor `gradlew.bat` exists in the Android project, doctor requires a system `gradle` executable because that is the CLI's compatibility fallback.

## Runtime contributor mode

`sting doctor --runtime` checks Sting runtime/source-build prerequisites. Zig is required in this mode only, and normal application project checks are skipped unless an explicit native target is also supplied.

Normal Sting application development must not require Zig or knowledge of the runtime implementation.

## JSON contract

`--json` emits a single object containing:

- `mode`: `app` or `runtime`
- `target`: explicit `ios` / `android`, otherwise `null`
- `projectRoot`
- `configPath` when a config exists
- detected/selected `platforms`
- `checks`, including project and environment results

Required failed checks make the command exit non-zero. Optional and skipped checks remain visible without blocking the command.
