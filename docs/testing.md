# Sting test and CI commands

Sting provides deterministic local verification commands so application developers do not need to remember separate npm, Xcode, Gradle, or CI entry points.

## Application checks

```bash
sting test
```

The command runs the application's available scripts in this order:

1. `typecheck` when defined
2. `test` when defined
3. `build` (required for a Sting application)

This mode is cross-platform and does not require a simulator, emulator, or physical device.

## Native build checks

```bash
sting test ios
sting test android
```

The iOS mode adds an Xcode build for a generic iOS Simulator destination. It requires macOS/Xcode but does not require a booted simulator.

The Android mode adds the configured Gradle assemble task (`debug` by default). It does not require adb or a connected device for the build itself.

Both modes honor `sting.config.ts` native project settings.

## Local CI-equivalent checks

```bash
sting ci
sting ci ios
sting ci android
```

`sting ci` first runs the same required project and environment checks as `sting doctor`, then runs the deterministic `sting test` pipeline. Platform targets make the corresponding toolchain and native project requirements mandatory before running the native build.

Use `sting run ios` or `sting run android` separately when you want to install and launch the application on a simulator, emulator, or physical device.
