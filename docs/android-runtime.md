# Android runtime architecture

This document describes the StingJS v0.1 Android runtime path and the internal boundaries between JavaScript, Zig/native code, JNI, Kotlin, and Android Views/APIs.

For the cross-platform architectural invariants, see [`architecture.md`](architecture.md). For the production JavaScript-engine decision, see [`decisions/0004-production-javascript-engine.md`](decisions/0004-production-javascript-engine.md). For async native-module threading/lifetime rules, see [`decisions/0005-async-native-modules-and-runtime-threading.md`](decisions/0005-async-native-modules-and-runtime-threading.md).

## Production path

StingJS v0.1 uses official QuickJS `2026-06-04` as the production JavaScript engine.

The Android path is:

```text
SolidJS 2 + TypeScript
    ↓
@solidjs/universal
    ↓
@stingjs/solid
    ↓
@stingjs/core / @stingjs/modules-core
    ↓
official QuickJS
    ↓
Zig-centered Sting runtime
    ↓
small C ABI
    ↓
JNI
    ↓
Kotlin runtime/module registry
    ↓
Android Views and Android platform APIs
```

Application developers and native-module authors do not choose or directly interact with these layers. `@stingjs/*` APIs remain engine-independent.

## What JNI is doing here

JNI (Java Native Interface) is Android's standard boundary between JVM code (Kotlin/Java) and native code (C/C++/Zig).

Sting uses JNI because the production QuickJS embedding and portable runtime live in native code while Android UI and platform APIs are implemented in Kotlin.

JNI is not a second application bridge and is not exposed publicly. It is the internal Android adapter at this boundary:

```text
Zig / C runtime ↔ JNI ↔ Kotlin runtime
```

The adapter should remain narrow. It translates primitive IDs/strings/JSON payloads and invokes known Kotlin runtime methods. It must not become the owner of renderer semantics, Solid state, module behavior, or lifecycle policy.

## Renderer and event flow

For native UI operations, JavaScript calls the Sting bridge exposed by the QuickJS host. Zig invokes narrow host callbacks, which cross JNI into Kotlin and mutate Android Views through `StingNodeRegistry`.

Conceptually:

```text
Solid signal/update
    ↓
Sting host mutation
    ↓
QuickJS host call
    ↓
Zig runtime
    ↓
JNI
    ↓
Kotlin StingNodeRegistry
    ↓
Android View mutation
```

Native input travels in the opposite direction:

```text
Android input
    ↓
Kotlin node/event registry
    ↓
QuickJS runtime wrapper
    ↓
JNI
    ↓
Zig/QuickJS
    ↓
__stingDispatchEvent(...)
    ↓
Solid computation
```

The JavaScript shadow tree remains authoritative for renderer structure queries; Android native code does not perform React-style reconciliation.

## Synchronous native modules

Haptics, Clipboard, and Device are the initial synchronous reference modules.

A sync call follows one call stack:

```text
JavaScript callSync()
    ↓
QuickJS
    ↓
Zig
    ↓
JNI
    ↓
Kotlin StingModuleRegistry.callSync()
    ↓
module implementation
    ↓
structured result/error JSON
    ↑
JNI / Zig / QuickJS
    ↑
JavaScript return/throw
```

Synchronous module work must remain small and non-blocking. Expensive I/O must not be hidden behind `callSync()`.

## Asynchronous native modules

Filesystem is the first planned consumer of the real async module contract.

Starting an async call:

```text
JavaScript
    ↓
callAsync("readFile", args)
    ↓
allocate request ID and Promise entry
    ↓
QuickJS → Zig → JNI
    ↓
Kotlin StingModuleRegistry.callAsync(...)
    ↓
module starts asynchronous work
    ↓
returns without waiting for completion
```

Completion may occur later and on a different native thread:

```text
Kotlin worker thread completes I/O
    ↓
Sting completion callback
    ↓
post result to runtime-owning Android Looper
    ↓
Kotlin runtime wrapper
    ↓
JNI completion entrypoint
    ↓
Zig/QuickJS runtime
    ↓
__stingResolveModuleCall(requestId, responseJSON)
    ↓
Promise resolves/rejects
```

The request ID is the stable correlation mechanism. Async calls do not need to complete in dispatch order.

## Thread ownership

For v0.1, the Android QuickJS runtime is created and owned on the Activity/main thread.

That gives Sting one simple rule:

> Only the runtime-owning thread may enter QuickJS.

A module is free to do work on another thread, coroutine dispatcher, executor, callback thread, or Android system thread. It is not free to enter QuickJS from there.

The runtime wrapper must marshal completion back onto its owning Looper before calling the native QuickJS completion entrypoint.

A future version may move JavaScript onto a dedicated runtime thread. The rule remains the same: one owner thread, explicit marshalling to that thread for all engine entry.

## `JNIEnv` lifetime and thread safety

`JNIEnv*` is provided by the JVM for the current attached thread. It is thread-local state, not a process-global handle.

Therefore:

- do not save a `JNIEnv*` on one thread and reuse it from another;
- do not call QuickJS from a background module callback merely because a native runtime pointer is available;
- do keep long-lived Java objects as JNI global references when the adapter legitimately owns them;
- method IDs may be cached after resolution;
- enter the async JNI completion function from the runtime-owning thread so the JVM supplies the correct `JNIEnv*` for that thread.

The current sync adapter can store the `JNIEnv*` received during a synchronous JNI entry only for operations performed within that same call/thread context. Async code must not assume that pointer remains valid on arbitrary completion threads.

## Async result envelope

The platform boundary carries only Sting-owned IDs and serialized values.

Success:

```json
{
  "ok": true,
  "value": {
    "example": "result"
  }
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "E_NOT_FOUND",
    "message": "File does not exist",
    "module": "Filesystem",
    "method": "readFile",
    "details": {
      "uri": "..."
    }
  }
}
```

The Android module API must not expose:

- QuickJS `JSValue`,
- Zig pointers,
- JNI `jobject`/`JNIEnv` values,
- engine-owned Promise objects.

Kotlin module authors work with Kotlin values and a Sting completion callback.

## Exactly-once and stale completions

Async completion is protected at more than one layer.

Native delivery should accept the first completion for a request and ignore duplicate callbacks. JavaScript removes the pending request before resolving/rejecting the Promise, so duplicate and re-entrant result delivery cannot settle it twice.

Unknown or stale IDs are safe no-ops.

This matters for buggy module implementations, out-of-order concurrency, and late Android callbacks after an Activity/runtime has already been destroyed.

## Runtime destruction

Before destroying the QuickJS context/runtime:

1. stop accepting new work for that runtime;
2. reject outstanding JavaScript async requests with `E_RUNTIME_DISPOSED`;
3. detach event/result sinks;
4. mark native/runtime request delivery as closed;
5. destroy QuickJS and release JNI global references.

If native work completes afterward, its result must be ignored. It must never re-enter a destroyed QuickJS runtime.

## Performance diagnostics

Async module performance should distinguish at least two measurements:

- **dispatch latency** — time spent getting the request from JS into the native async module;
- **completion latency** — elapsed time from dispatch until the native result is delivered back to the JS Promise.

Those answer different questions. A filesystem operation can have negligible bridge dispatch overhead while still taking meaningful wall-clock time to complete.

## Scope of the secondary engine lane

QuickJS-NG is not part of this architecture contract. It may reuse the same shape while its secondary conformance lane remains cheap to maintain, but Android production async work targets official QuickJS first. QuickJS-NG support must not introduce duplicate public APIs or delay Filesystem/production runtime work.
