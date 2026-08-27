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

A project without `sting.config.ts` remains valid; the CLI reports that project inference will be used.

## iOS mode

`sting doctor ios` makes Xcode and `simctl` required and verifies the configured/inferred iOS project path. Running the iOS doctor on a non-macOS host fails with a clear platform requirement.

## Android mode

`sting doctor android` makes the Android toolchain required:

- Java 17 or newer
- `ANDROID_SDK_ROOT` or `ANDROID_HOME`
- adb
- configured/inferred Android project directory

## Runtime contributor mode

`sting doctor --runtime` checks Sting runtime/source-build prerequisites. Zig is required in this mode only. Normal application doctor modes continue to treat Zig as not required.
