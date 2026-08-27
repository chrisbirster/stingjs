# Sting Modules SDK

Sting modules package native platform capabilities behind a stable JavaScript API without moving platform-neutral runtime ownership out of Sting's Zig-centered architecture.

## Package shape

A first-party module lives under `packages/modules/<name>`:

```text
packages/modules/clipboard/
  src/index.ts
  ios/ClipboardModule.swift
  android/src/main/java/run/stingjs/modules/clipboard/ClipboardModule.kt
  android/build.gradle.kts
  Package.swift
  package.json
  sting-module.json
```

`@stingjs/modules-core` is the JavaScript authoring boundary. Module packages should use `createNativeModule()` instead of importing `getHost()` directly.

```ts
import { createNativeModule } from '@stingjs/modules-core';

const nativeClipboard = createNativeModule('Clipboard');

export const Clipboard = {
  getString: () => nativeClipboard.callSync<string>('getString') ?? '',
  setString: (value: string) => nativeClipboard.callSync('setString', [value]),
};
```

## Manifest

Every module must provide `sting-module.json` using schema version 1. The manifest identifies the JavaScript package, native module classes, platform permissions, and the runtime capabilities the module needs.

```json
{
  "schemaVersion": 1,
  "name": "Clipboard",
  "package": "@stingjs/clipboard",
  "version": "0.1.0",
  "ios": {
    "module": "ClipboardModule",
    "permissions": []
  },
  "android": {
    "module": "run.stingjs.modules.clipboard.ClipboardModule",
    "permissions": []
  },
  "capabilities": ["sync-functions"]
}
```

Run `npm run modules:validate` to validate all first-party manifests and required package structure.

## Native contract today

The v0.1 module transport currently supports synchronous functions through `StingNativeModule.callSync` and `StingModuleRegistry`. This is intentionally honest: modules must not simulate asynchronous native work by wrapping a synchronous native call in `Promise.resolve()`.

Haptics, Clipboard, and Device are the reference synchronous modules. Device also proves a structured object can round-trip through the shared module contract while keeping platform-specific environment detection in Swift/Kotlin.

## Modules-core capability roadmap

`@stingjs/modules-core` will grow the native contract in small independently tested steps:

1. sync functions — implemented;
2. async functions / Promises;
3. module event streams and subscription disposal;
4. permission declarations and generated platform configuration;
5. native object handles and deterministic lifetime/disposal;
6. native module views;
7. application lifecycle callbacks and background delivery;
8. autolinking from `sting-module.json` into generated iOS/Android host configuration.

Each capability must work through the portable Sting contract and preserve structured native errors. Engine-specific objects such as QuickJS `JSValue`, Hermes/JSI values, Swift objects, or Kotlin/JNI objects must not become public Sting module types.

## First-party module roadmap

The first useful platform set is expected to include:

- `@stingjs/haptics`
- `@stingjs/clipboard`
- `@stingjs/device`
- `@stingjs/filesystem`
- `@stingjs/secure-store`
- `@stingjs/location`
- `@stingjs/image-picker`
- `@stingjs/audio`
- `@stingjs/camera`
- `@stingjs/notifications`

Audio and Camera should be built only after modules-core has real async, event, permission, native-object, and native-view support; otherwise those packages would force one-off runtime APIs that later have to be replaced.
