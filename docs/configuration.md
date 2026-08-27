# Sting application configuration

Sting applications can define project-level developer tooling settings in `sting.config.ts`.

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

The CLI also accepts `sting.config.mts`, `sting.config.js`, `sting.config.mjs`, and `sting.config.cjs`. TypeScript config files are loaded by the CLI itself so they work on Sting's Node 22.12 minimum without requiring a separate TypeScript runtime loader in the application.

## Inspect the resolved config

```bash
sting config
sting config --json
sting config --project-root ./examples/hello-world
```

## Native run commands

`sting run ios` uses the configured Xcode project, scheme, bundle identifier, and default configuration. Command-line flags still take precedence when supplied.

```bash
sting run ios
sting run ios --device "iPhone 17 Pro"
sting run ios --configuration Release
```

`sting run android` uses the configured Android directory, package name, and Gradle variant.

```bash
sting run android
sting run android --device emulator-5554
sting run android --variant release
```

If a config file is absent, the CLI keeps the current inference behavior for compatibility: it looks for a single Xcode project/scheme under `ios/`, reads the Android application ID from `android/app/build.gradle(.kts)`, and uses Debug defaults.

## Development server

The optional `bundle` value becomes the default bundle served by `sting start`.

```bash
sting start
```

An explicit `--bundle` flag overrides the configured value.

## Zig

Application configuration does not expose or require Zig. Zig remains a Sting runtime/source-build concern and is checked only with `sting doctor --runtime`.
