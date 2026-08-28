# `@stingjs/cli`

Developer tooling for StingJS. The npm package is intentionally `private: true` until the `stingjs` npm organization/scope is confirmed, but the installed executable is `sting`.

## Commands

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js doctor ios
node dist/cli.js doctor android
node dist/cli.js doctor --project-root ../../examples/hello-world
node dist/cli.js doctor --runtime
node dist/cli.js devices
node dist/cli.js config --project-root ../../examples/hello-world
node dist/cli.js start --project-root ../../examples/hello-world
node dist/cli.js run ios --project-root ../../examples/hello-world
node dist/cli.js run android --project-root ../../examples/hello-world
```

### `sting doctor`

Checks both the Sting project and the local environment needed for that project's native targets.

```bash
sting doctor
sting doctor ios
sting doctor android
sting doctor --project-root ./apps/my-app
sting doctor --json
```

The project check validates `package.json`, `@stingjs/solid`, a Solid 2-compatible `solid-js` declaration, the normal `npm run build` contract, any discovered `sting.config.ts` (or supported JavaScript variant), configured native project paths, and Android Gradle-wrapper availability. A missing Sting config is not an error: projects that rely on the CLI's native-project inference remain supported.

Without an explicit target, doctor detects iOS and Android from config or conventional native directories and makes the relevant local toolchain required where it can run. `sting doctor ios` and `sting doctor android` are explicit platform gates. Android requires Java 17+, the Android SDK, and adb. If the Android project has no Gradle wrapper, doctor also requires a system Gradle installation as the existing fallback. Explicit iOS doctor requires macOS, Xcode, and simctl; an inferred iOS target on another operating system is reported as skipped so Android work can continue there.

Node and npm remain application prerequisites. Zig is deliberately **not required** for ordinary Sting app developers and is shown as not required in the default doctor output.

Sting runtime contributors and source-build workflows can opt into the lower-level toolchain check with:

```bash
sting doctor --runtime
```

In runtime mode, Zig is required and project application checks are skipped unless an explicit native target is supplied. This keeps Sting's Zig-centered implementation an internal/runtime concern instead of forcing application developers to install or understand Zig.

Use `--json` for machine-readable output. JSON output includes `mode`, explicit `target`, `projectRoot`, detected `platforms`, the resolved `configPath` when present, and all project/environment checks.

See `docs/doctor.md` for the complete doctor contract.

### `sting devices`

Lists connected Android devices/emulators and, on macOS, available iOS simulators.

Use `--json` for editor/automation integration.

### `sting config`

Loads and validates the project's `sting.config.ts` (or supported JavaScript config variant) and prints the resolved configuration.

```bash
sting config
sting config --json
```

A typical TypeScript config is:

```ts
import { defineConfig } from '@stingjs/cli/config';

export default defineConfig({
  name: 'My App',
  bundle: 'dist/sting-app.js',
  ios: {
    project: 'ios/MyApp.xcodeproj',
    scheme: 'MyApp',
    bundleIdentifier: 'com.example.myapp',
    configuration: 'Debug',
  },
  android: {
    directory: 'android',
    package: 'com.example.myapp',
    variant: 'debug',
  },
});
```

The CLI transpiles TypeScript config files itself, so `sting.config.ts` works on the Node 22.12 minimum without requiring the application to install `tsx`, `ts-node`, or another runtime loader.

### `sting run ios`

Builds the JavaScript application, selects a booted iOS simulator when possible, builds the native Xcode project, installs the app, and launches it.

```bash
sting run ios
sting run ios --device "iPhone 17 Pro"
sting run ios --device <simulator-udid>
sting run ios --configuration Release
```

When `sting.config.ts` provides `ios.project`, `ios.scheme`, `ios.bundleIdentifier`, or `ios.configuration`, the command uses those values. Projects without config retain the original single-project/single-scheme inference behavior.

### `sting run android`

Builds the JavaScript application, selects a connected Android device/emulator, installs the configured Gradle variant, and launches its launcher activity through adb.

```bash
sting run android
sting run android --device <adb-serial>
sting run android --device "Pixel 9"
sting run android --variant release
```

When `sting.config.ts` provides `android.directory`, `android.package`, or `android.variant`, the command uses those values. The command prefers `android/gradlew` (or `gradlew.bat` on Windows). The current repository hello-world example does not yet check in a Gradle wrapper, so it falls back to a system `gradle` executable. Generated Sting applications should include a Gradle wrapper so ordinary app developers do not need a separately installed Gradle distribution.

Both `run` commands accept `--no-bundle` to skip the CLI's explicit `npm run build` step when the native project already owns bundle generation.

### `sting start`

Serves a built Sting application bundle to Sting Go. The default remains `dist/sting-app.js`, while `sting.config.ts` can set another default with `bundle`. An explicit `--bundle` flag wins over config.

The server exposes:

```text
GET /manifest
GET /bundle
GET /health
```

and prints a deep link of the form:

```text
sting://go?url=http%3A%2F%2F192.168.1.10%3A8081%2Fmanifest
```

The first server slice deliberately does not run Vite itself. Build/watch integration, QR rendering, and reload signaling remain follow-up work.

## Publishing scope

Official packages should use the `@stingjs/*` scope. The unscoped npm package `sting` already belongs to an unrelated project, while this repository already uses names such as `@stingjs/core` and `@stingjs/solid`.

Before making this package publishable, confirm or create the `stingjs` organization on npm and remove `private: true` as part of a reviewed release change.
