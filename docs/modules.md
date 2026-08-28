# Sting Modules SDK

Sting modules package native platform capabilities behind a stable JavaScript API without moving platform-neutral runtime ownership out of Sting's Zig-centered architecture.

## Package shape

A first-party module lives under `packages/modules/<name>`:

```text
packages/modules/filesystem/
  src/index.ts
  ios/FilesystemModule.swift
  android/src/main/java/run/stingjs/modules/filesystem/FilesystemModule.kt
  android/build.gradle.kts
  Package.swift
  package.json
  sting-module.json
```

`@stingjs/modules-core` is the JavaScript authoring boundary for module functions, events, and native objects. Module-owned native view components are created through `createNativeModuleView()` from `@stingjs/solid` so they remain ordinary Sting renderer nodes.

Synchronous modules use `callSync()`:

```ts
import { createNativeModule } from '@stingjs/modules-core';

const nativeClipboard = createNativeModule('Clipboard');

export const Clipboard = {
  getString: () => nativeClipboard.callSync<string>('getString') ?? '',
  setString: (value: string) => nativeClipboard.callSync('setString', [value]),
};
```

Asynchronous modules use the same client boundary with `callAsync()`:

```ts
const nativeFilesystem = createNativeModule('Filesystem');

export const Filesystem = {
  readText: (path: string) =>
    nativeFilesystem.callAsync<string>('readText', [path, 'documents']),
};
```

`callAsync()` represents real native asynchronous completion. It must not be implemented as `Promise.resolve(callSync(...))`.

Repeated native event streams use `addListener()`:

```ts
const nativeNetwork = createNativeModule('Network');

const subscription = nativeNetwork.addListener<{ connected: boolean }>(
  'change',
  state => {
    console.log(state.connected);
  },
);

subscription.remove();
```

Each `addListener()` call owns an independent subscription handle, even when the same callback function is registered more than once. The first JavaScript listener for a `(module, event)` pair enables native observation. Additional listeners share that observation. Removing the final listener disables native observation. `remove()` is idempotent.

Listener fanout is snapshot-based: a listener may remove itself or another subscription while handling an event without corrupting the current delivery. After the final listener is removed, later/stale native emissions are ignored.

Long-lived native resources use the shared opaque-object capability documented in [`native-objects.md`](./native-objects.md). Module-created UIKit/Android view components use the renderer-integrated capability documented in [`native-module-views.md`](./native-module-views.md).

## Manifest

Every module must provide `sting-module.json` using schema version 1. The manifest identifies the JavaScript package, native module classes, platform permissions, and the runtime capabilities the module needs.

```json
{
  "schemaVersion": 1,
  "name": "Filesystem",
  "package": "@stingjs/filesystem",
  "version": "0.1.0",
  "ios": {
    "module": "FilesystemModule",
    "permissions": []
  },
  "android": {
    "module": "run.stingjs.modules.filesystem.FilesystemModule",
    "permissions": []
  },
  "capabilities": ["async-functions"]
}
```

Modules combine only the shared capabilities they require:

```json
{
  "capabilities": [
    "async-functions",
    "events",
    "permissions",
    "native-objects",
    "native-views"
  ]
}
```

Run `npm run modules:validate` to validate all first-party manifests and required package structure. `native-views` is already an authoritative schema-v1 capability; this capability does not require a new manifest schema version.

## Native contract today

The v0.1 module transport supports:

- synchronous functions through `StingNativeModule.callSync` and `StingModuleRegistry`;
- real asynchronous functions through `StingNativeModule.callAsync` and `@stingjs/modules-core` Promises;
- repeated native event streams through `StingNativeModule.setEventEnabled` and `@stingjs/modules-core` subscriptions;
- generated permission/platform configuration from authoritative `sting-module.json` declarations;
- opaque native object handles with sync/async methods and deterministic disposal;
- native module views integrated into the existing Sting host renderer;
- structured success values and `StingNativeError` failures;
- lifecycle-safe pending Promise settlement, event subscription disposal, object disposal, and module-view teardown;
- background native completion/event callbacks marshalled back to the owning JavaScript runtime thread before engine re-entry.

Haptics, Clipboard, and Device are the reference synchronous modules. Device also proves a structured object can round-trip through the shared module contract while keeping platform-specific environment detection in Swift/Kotlin.

Filesystem is the first real asynchronous reference module. Its file work runs away from the JavaScript/runtime thread and returns through the shared async transport; it does not add Filesystem-specific JNI, QuickJS, or JavaScriptCore APIs.

On Android with official QuickJS, async completion follows the runtime-owned path documented in ADR 0005 and `docs/android-runtime.md`:

```text
Kotlin worker -> owning Looper -> JNI -> Zig -> QuickJS -> Promise settlement
```

Native module events follow the same engine-entry rule:

```text
Kotlin callback -> owning Looper -> JNI -> Zig -> QuickJS -> JS listeners
Swift callback  -> main queue    -> JavaScriptCore         -> JS listeners
```

A native module may invoke its event emitter from a worker, coroutine dispatcher, system callback thread, or the runtime thread. It must not enter QuickJS or JavaScriptCore itself. The Sting runtime owns that marshalling.

JNI is an internal Android runtime boundary, not a module authoring API.

### Native event implementation

Swift modules implement the shared event hook when they expose events:

```swift
func setEventEnabled(
    event: String,
    enabled: Bool,
    emit: @escaping StingNativeModuleEventEmitter
) throws {
    // Start/stop platform observation. Call emit(payload) for each event.
}
```

Kotlin uses the equivalent `StingNativeModule.setEventEnabled(event, enabled, emit)` contract.

Unknown events should throw `StingNativeModuleError(code: "E_EVENT_NOT_FOUND", ...)`. The runtime converts enable/disable failures into structured `StingNativeError` data on the JavaScript side. A protocol-v1 host that predates module-event support fails clearly with `E_EVENTS_UNSUPPORTED`; Sting does not emulate events with polling or synchronous calls.

Native observation should be stopped when `enabled` becomes false. Sting also keeps its own active-observation registry so callbacks that arrive after unsubscribe or runtime disposal become no-ops. Runtime disposal clears JavaScript listener state before disabling native observations and detaching event sinks.

Renderer/node events such as button presses and native module view events remain a separate transport keyed by native node IDs. Module-wide events do not reuse renderer node identity or DOM-style event semantics.

### Native module views

A module package can expose a real UIKit/Android view as a normal Solid component:

```ts
import { createNativeModuleView } from '@stingjs/solid';

export const CameraPreview = createNativeModuleView<CameraPreviewProps>(
  'Camera',
  'Preview',
);
```

The component is still rendered by the existing Solid `@solidjs/universal` adapter. Sting routes its creation through the ordinary `createElement` host operation and routes its properties, node events, insertion, removal, and keyed movement through the same host tree as built-in primitives.

`removeNode` only detaches a module view because Solid may reinsert the same keyed host node. Native implementations receive separate attach/detach hooks and one final runtime-owned `dispose()`. Detached or disposed views cannot dispatch stale node events.

See [`native-module-views.md`](./native-module-views.md) for the Swift/Kotlin authoring contract, optional child containers, lifecycle rules, and engine boundaries.

## Filesystem v0.1

`@stingjs/filesystem` intentionally begins with app-private storage:

```ts
Filesystem.readText(path, { directory: 'documents' })
Filesystem.writeText(path, contents, { directory: 'cache' })
Filesystem.delete(path, options)
Filesystem.makeDirectory(path, options)
Filesystem.getInfo(path, options)
```

The default directory is `documents`. `documents` and `cache` are portable logical roots; callers do not receive or depend on platform absolute paths.

Paths must be relative and stay inside the selected root. Absolute paths, `.`/`..` traversal, and canonicalized paths that escape through symlinks are rejected with `E_INVALID_PATH`. `writeText()` requires its parent directory to already exist; use `makeDirectory()` explicitly when a new directory tree is needed.

The first slice requires no platform permissions because both roots are private to the application sandbox. User-selected files, shared storage, and broader storage permission/configuration belong to later shared capability work.

Until autolinking lands, applications explicitly register native modules in their iOS and Android host configuration. `sting-module.json` remains the authoritative metadata intended to drive that generated wiring later.

## Modules-core capability roadmap

The shared v0.1 capability train is now:

1. sync functions — implemented;
2. async functions / Promises — implemented;
3. module event streams and subscription disposal — implemented;
4. permission declarations and generated platform configuration — implemented;
5. native object handles and deterministic lifetime/disposal — implemented;
6. native module views — implemented;
7. application lifecycle callbacks and background delivery — next;
8. autolinking from `sting-module.json` into generated iOS/Android host configuration;
9. module authoring template/scaffolder.

Each capability must work through the portable Sting contract and preserve structured native errors. Engine-specific objects such as QuickJS `JSValue`, Hermes/JSI values, Swift objects, Kotlin/JNI objects, UIKit views, or Android `View` instances must not become public Sting module values.

## First-party module roadmap

The first useful platform set is expected to include:

- `@stingjs/haptics` — synchronous reference module;
- `@stingjs/clipboard` — synchronous reference module;
- `@stingjs/device` — structured synchronous metadata reference module;
- `@stingjs/filesystem` — asynchronous reference module;
- `@stingjs/secure-store`;
- `@stingjs/location`;
- `@stingjs/image-picker`;
- `@stingjs/sharing`;
- `@stingjs/network`;
- `@stingjs/sensors`;
- `@stingjs/audio`;
- `@stingjs/camera`;
- `@stingjs/notifications`.

Location, Network, Sensors, Notifications, Audio, and Camera can share the generic event transport. Audio and Camera can now also consume the shared permission, native-object, and native-view capabilities instead of adding private bridge mechanisms.
