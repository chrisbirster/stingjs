# Native module objects

Sting native objects are the shared Modules SDK lifetime primitive for long-lived platform resources such as audio players, camera sessions, database cursors, streams, and other stateful native capabilities.

They are deliberately **not** JavaScript engine objects. JavaScript receives a Sting-owned wrapper around an opaque positive-integer handle; Swift/Kotlin objects, QuickJS `JSValue`s, JSI values, JNI references, pointers, file descriptors, and other platform identities never cross the public module boundary.

## JavaScript API

A module creates an object through `@stingjs/modules-core`:

```ts
import { createNativeModule } from '@stingjs/modules-core';

const nativeAudio = createNativeModule('Audio');
const player = nativeAudio.createObject('Player', ['song.mp3']);

const state = player.callSync('status');
await player.callAsync('prepare');
player.dispose();
```

`NativeModuleObject` exposes:

- `module` — the owning Sting native module name
- `type` — the module-defined object type requested at creation
- `disposed` — whether the JavaScript wrapper has been retired
- `callSync(method, args?)`
- `callAsync(method, args?)`
- `dispose()`

The numeric native handle is intentionally not part of the public object API.

## Ownership

Every handle has exactly one owning Sting runtime and one owning native module.

A native registry allocates monotonically increasing handle IDs for that runtime. Looking up an unknown or previously disposed handle fails with `E_OBJECT_NOT_FOUND`. Attempting to use a live handle through a different module fails with `E_OBJECT_MODULE_MISMATCH`.

Handles are runtime-local identities. They are not persistence IDs, are not serializable application state, and must never be cached for reuse in another Sting runtime.

The JavaScript wrapper captures the `StingHost` that created it. Replacing the active host therefore cannot silently migrate an object to a new runtime.

## Disposal

`dispose()` on the JavaScript wrapper is explicit and idempotent:

```ts
player.dispose();
player.dispose(); // no second native dispose
```

After disposal, sync or async calls through that wrapper fail with `E_OBJECT_DISPOSED` without crossing the native bridge again.

Runtime teardown also disposes every registered live wrapper. Native Swift/Kotlin registries provide a second, final teardown pass for raw or abandoned handles. This two-level cleanup means module authors can rely on native resources being released even when application code forgets to call `dispose()`.

Native registry disposal removes an object's handle before invoking its native disposal hook. Any re-entrant or later use of that handle is therefore stale immediately.

## Sync and async object methods

Native objects reuse the existing Modules SDK transport rather than adding a JavaScript-engine-specific object ABI. Internally, modules-core encodes object operations as Sting-reserved module methods:

```text
__sting_object_create
__sting_object_call_sync
__sting_object_call_async
__sting_object_dispose
```

These names are framework-internal and reserved; module authors should not expose ordinary module methods with these names.

Because asynchronous object calls use the same native async request IDs and Promise settlement path as ordinary async module functions, they inherit ADR 0005's threading rule: native work may complete off-thread, but JavaScript engine re-entry occurs only on the owning runtime thread. Object handles do not become a second async transport.

## Swift module authoring

A module that exposes objects implements `createObject(type:arguments:)` and returns a `StingNativeObject`:

```swift
final class PlayerObject: StingNativeObject {
    func callSync(method: String, arguments: [Any]) throws -> Any? {
        // return portable JSON-compatible values only
    }

    func callAsync(
        method: String,
        arguments: [Any],
        completion: @escaping StingNativeModuleCompletion
    ) {
        // complete with portable JSON-compatible values
    }

    func dispose() {
        // stop/release native resources
    }
}
```

The module never allocates or exposes the Sting handle itself. `StingModuleRegistry` owns handle assignment, module ownership checks, stale-handle rejection, and runtime cleanup.

## Kotlin module authoring

The Android contract is parallel:

```kotlin
class PlayerObject : StingNativeObject {
    override fun callSync(method: String, arguments: List<Any?>): Any? {
        // return portable JSON-compatible values only
    }

    override fun callAsync(
        method: String,
        arguments: List<Any?>,
        completion: StingNativeModuleCompletion,
    ) {
        // complete with portable JSON-compatible values
    }

    override fun dispose() {
        // stop/release native resources
    }
}
```

`StingNativeModule.createObject(type, arguments)` creates the platform object; `StingModuleRegistry` owns its opaque handle and lifetime.

## Error behavior

Public object calls preserve the module and public object method in `StingNativeError`, even though the underlying transport uses reserved internal operations. Important object-specific codes include:

- `E_OBJECT_DISPOSED` — the JS wrapper has already been retired
- `E_INVALID_OBJECT_HANDLE` — a malformed handle crossed the internal boundary
- `E_OBJECT_NOT_FOUND` — the handle is stale or unknown
- `E_OBJECT_MODULE_MISMATCH` — the handle belongs to another module
- `E_OBJECT_TYPE_NOT_FOUND` — the module does not expose the requested object type
- `E_OBJECT_METHOD_NOT_FOUND` — the object does not expose the requested method
- `E_OBJECT_HANDLE_EXHAUSTED` — the runtime cannot allocate another handle

Ordinary native values remain the only method arguments/results. Native object identity itself is never encoded into `NativeValue` application data.

## Relationship to views and events

Native object handles are a distinct identity space from renderer node IDs and module-event subscriptions. A future native-view API may internally own or reference a native object, but it must not reuse renderer node identity as object identity.

Likewise, an object that needs repeated callbacks should use the shared event/subscription model rather than smuggling callbacks or engine values into the object handle. Audio and Camera are expected to build on the shared async, events, permissions, native-object, and native-view capabilities rather than introducing private bridges.
