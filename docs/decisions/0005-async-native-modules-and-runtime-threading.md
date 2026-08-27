# ADR 0005: Asynchronous native modules and runtime thread ownership

- Status: accepted
- Date: 2026-08-27

## Context

Sting's first native modules used synchronous calls because Haptics, Clipboard, and Device can complete immediately without blocking on meaningful I/O. Filesystem and later modules such as Location, Image Picker, Audio, Camera, Notifications, and background work require a real asynchronous contract.

Wrapping a synchronous native call in `Promise.resolve()` would only change the JavaScript surface. It would still block the runtime thread while native work executes and would not provide correct concurrency, cancellation/lifecycle behavior, or completion ordering.

Asynchronous native work also introduces a thread-ownership problem. A Swift or Kotlin module may complete on a background queue/thread, but JavaScriptCore and QuickJS runtime state must only be entered from the thread that owns the runtime. On Android, JNI is the implementation boundary between the Zig/C runtime and Kotlin/Java; `JNIEnv` is thread-local and must not be treated as a cross-thread runtime handle.

## Decision

Sting native-module async calls use a Sting-owned request/completion protocol rather than engine-specific Promise objects.

The JavaScript API is:

```ts
await nativeModule.callAsync("readFile", [uri]);
```

The internal flow is:

```text
JavaScript Promise
    ↓
monotonic request ID + pending JS registry
    ↓
callModuleAsync(module, method, argsJSON, requestId)
    ↓
Sting native module registry
    ↓
Swift/Kotlin asynchronous work
    ↓
structured completion envelope
    ↓
runtime-owned result sink
    ↓
marshal to owning JavaScript-runtime thread
    ↓
__stingResolveModuleCall(requestId, responseJSON)
    ↓
resolve/reject the matching Promise
```

### Request identity and settlement

- Request IDs are monotonically unique for the JavaScript process and are not reused across host instances.
- Concurrent calls may complete in any order.
- Pending JS entries are removed before Promise settlement so duplicate or re-entrant completions cannot settle the same Promise twice.
- Native bridge delivery also enforces exactly-once completion for each request where practical.
- Unknown, stale, or already-completed request IDs are ignored safely.
- Native failures preserve the structured `StingNativeError` envelope.

### Runtime lifetime

Before a JavaScript runtime/context is destroyed, Sting rejects every outstanding async call with `E_RUNTIME_DISPOSED` and removes its completion globals/sinks.

Late native completions after runtime disposal must not re-enter a destroyed engine. They are treated as stale and ignored.

### Thread ownership

For v0.1, the JavaScript runtime is owned by the main/UI thread on both platforms.

- **iOS:** asynchronous module work may run on background queues, but completion is marshalled to the main queue before entering JavaScriptCore and calling `__stingResolveModuleCall`.
- **Android:** asynchronous Kotlin work may run on worker threads, but completion is posted to the owning Android Looper before entering JNI/Zig/QuickJS. QuickJS is never called directly from an arbitrary module worker thread.

The runtime thread rule is architectural. A future dedicated JavaScript thread may replace the main thread, but all engine entry must still be marshalled to the single owning runtime thread.

### JNI boundary on Android

JNI is an internal platform implementation detail, not a public Sting module API.

The Android production path is:

```text
Solid / TypeScript
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
Kotlin Sting module registry
    ↓
Android APIs
```

Module authors work with Kotlin values and the Sting module completion contract. They do not receive `JNIEnv`, JNI object references, QuickJS `JSValue`, or Zig pointers.

The JNI adapter may cache method IDs/global object references that are valid for its lifetime, but it must not cache a `JNIEnv*` for use from unrelated threads. Async completion should enter JNI from the runtime-owning thread, where the current `JNIEnv*` is supplied by the JVM.

### Protocol compatibility

This work remains an additive v0.1 bridge capability rather than forcing a protocol-major bump solely because async calls are added.

Sync-only hosts and sync-only applications remain valid. A host that does not implement the async bridge capability must fail `callAsync()` clearly rather than falling back to a synchronous call.

A protocol-major version bump is still required if a future change makes existing protocol-v1 operations or envelopes incompatible.

### Engine scope

ADR 0004 selects official QuickJS `2026-06-04` as the StingJS v0.1 production engine. Async native-module implementation therefore targets:

1. the engine-independent JavaScript/runtime contract,
2. JavaScriptCore/UIKit as the iOS semantic/reference integration,
3. Kotlin/Android + official QuickJS as the Android production integration.

QuickJS-NG is a secondary compatibility lane only. It must not delay or complicate the production async architecture; async QuickJS-NG coverage is retained only when inexpensive.

## Rejected alternatives

### Promise wrapper around synchronous native calls

Rejected because it still blocks the runtime thread and does not represent asynchronous native completion.

### Expose native/engine Promise objects across the bridge

Rejected because it would leak JavaScriptCore, QuickJS, JNI, Swift, Kotlin, or other engine/platform objects into Sting's public module contract.

### Allow native completion threads to call the engine directly

Rejected because JavaScript engine state and JNI thread state are not safely transferable to arbitrary module worker threads.

### Maintain parallel production async implementations for every evaluated JavaScript engine

Rejected for v0.1. Official QuickJS is the production path. Secondary engine coverage is useful only when it remains cheap and independent.

## Consequences

- Filesystem can be the first real asynchronous acceptance module without inventing a private bridge.
- Events, permissions, object handles, and later lifecycle-heavy modules can build on the same runtime ownership model.
- Runtime disposal becomes an explicit part of native-module correctness.
- Android JNI threading/lifetime behavior is documented and testable instead of remaining implicit adapter knowledge.
- Performance diagnostics should record async dispatch cost separately from full native completion latency.

See [`../android-runtime.md`](../android-runtime.md), [`0004-production-javascript-engine.md`](0004-production-javascript-engine.md), and issue #43.
