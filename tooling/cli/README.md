# `@stingjs/cli`

Developer tooling for StingJS. The npm package is intentionally `private: true` until the `stingjs` npm organization/scope is confirmed, but the installed executable is `sting`.

## Commands

```bash
npm install
npm run build
node dist/cli.js doctor
node dist/cli.js doctor --runtime
node dist/cli.js devices
node dist/cli.js start --project-root ../../examples/hello-world
node dist/cli.js run ios --project-root ../../examples/hello-world
node dist/cli.js run android --project-root ../../examples/hello-world
```

### `sting doctor`

Checks the local environment for normal Sting application development.

Node and npm are application prerequisites. Platform-native tools are reported when relevant for iOS or Android development. Zig is deliberately **not required** for ordinary Sting app developers and is shown as not required in the default doctor output.

Sting runtime contributors and source-build workflows can opt into the lower-level toolchain check with:

```bash
sting doctor --runtime
```

In runtime mode, Zig is required. This keeps Sting's Zig-centered implementation an internal/runtime concern instead of forcing application developers to install or understand Zig.

Use `--json` for machine-readable output. JSON output includes a `mode` field with either `app` or `runtime`.

### `sting devices`

Lists connected Android devices/emulators and, on macOS, available iOS simulators.

Use `--json` for editor/automation integration.

### `sting run ios`

Builds the JavaScript application, selects a booted iOS simulator when possible, builds the native Xcode project, installs the app, and launches it.

```bash
sting run ios
sting run ios --device "iPhone 17 Pro"
sting run ios --device <simulator-udid>
sting run ios --configuration Release
```

The command currently infers a single `.xcodeproj` from the project's `ios/` directory and a single shared Xcode scheme when present. `--project-root` can point at a Sting app when the command is not run from that app's root.

### `sting run android`

Builds the JavaScript application, selects a connected Android device/emulator, installs the Debug application through Gradle, and launches its launcher activity through adb.

```bash
sting run android
sting run android --device <adb-serial>
sting run android --device "Pixel 9"
```

The command prefers `android/gradlew` (or `gradlew.bat` on Windows). The current repository hello-world example does not yet check in a Gradle wrapper, so it falls back to a system `gradle` executable. Generated Sting applications should include a Gradle wrapper so ordinary app developers do not need a separately installed Gradle distribution.

Both `run` commands accept `--no-bundle` to skip the CLI's explicit `npm run build` step when the native project already owns bundle generation.

### `sting start`

Serves an already-built Sting application bundle to Sting Go.

Default bundle:

```text
dist/sting-app.js
```

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
