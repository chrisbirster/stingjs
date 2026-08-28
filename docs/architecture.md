# StingJS architecture

## Goal

StingJS provides a native application platform for SolidJS with an Expo-like developer experience, without React Native, Expo runtime dependencies, or a WebView rendering layer.

If you are trying to understand the concrete path from `App.tsx` and Vite to a running UIKit application, start with [`how-sting-runs.md`](how-sting-runs.md). For the concrete Android QuickJS → Zig → JNI → Kotlin runtime path, see [`android-runtime.md`](android-runtime.md). This document focuses on the architectural boundaries and invariants behind those pipelines.

The architectural invariant is:

```text
application SolidJS
       ↓
@stingjs/native components
       ↓
@stingjs/solid adapter
       ↓
@stingjs/core host contract
       ↓
platform runtime
       ↓
UIKit / Android Views
```

Native modules use a parallel path:

```text
TypeScript module API
       ↓
@stingjs/modules-core
       ↓
@stingjs/core host/module contract
       ↓
versioned Sting bridge
       ↓
Swift / Kotlin module registry
       ↓
OS API
```

## Why the layers exist

### `@stingjs/core`

Owns stable Sting concepts: host nodes, native mutation operations, event dispatch, module calls, error envelopes, protocol versioning, and runtime lifecycle. It must be usable in tests without Solid or a device.

### `@stingjs/modules-core`

Owns the JavaScript module-authoring boundary shared by first-party and third-party native modules. Module packages use `createNativeModule()` for availability/version checks and typed calls instead of reaching into low-level host APIs directly. Shared async, event, permission, native-object, native-view, lifecycle, and autolinking capabilities should extend this boundary rather than create one-off bridges in individual modules.

### `@stingjs/solid`

Adapts Solid 2 universal rendering to the Sting host contract. Solid's custom-renderer API is intentionally contained here because renderer APIs can evolve independently of Sting's public API.

As of August 2026, Solid 2 publishes its universal renderer separately as `@solidjs/universal`. Sting will pin a tested Solid release and change this adapter when Solid changes; app code must not depend on the upstream renderer contract.

### `@stingjs/native`

Provides developer-facing components (`View`, `Text`, `Button`, then `Image`, `TextInput`, and `ScrollView`) and their TypeScript props. These components target Sting host elements rather than DOM elements.

### Native runtime

The runtime owns actual native objects, applies mutations, dispatches native events back into JavaScript, and hosts the native-module registry. The native runtime must not know about Solid signals or component semantics.

## JavaScript engine strategy

JavaScript-engine choice is an implementation decision behind the Sting runtime contract, not part of the public application API. Normal Sting applications do not choose an engine.

StingJS v0.1 uses **official QuickJS `2026-06-04`** as the production JavaScript engine. New runtime and native-module capabilities should target that path first.

The first verified iOS native proof used Apple's JavaScriptCore framework because it is built into iOS and allowed Sting to prove the renderer → native event → Solid signal → precise native mutation loop before introducing a portable runtime dependency. JavaScriptCore/UIKit remains an independent iOS semantic/native reference lane rather than the v0.1 production runtime.

The engine-evaluation work also produced independent hosts for official QuickJS, QuickJS-NG, and Hermes. That historical work remains useful evidence, but the lanes are now intentionally asymmetric:

- official QuickJS `2026-06-04` — production runtime,
- QuickJS-NG — temporary independent conformance/performance lane and guard against accidentally relying on an official-QuickJS-specific quirk,
- React Native 0.87 + Hermes — external competitor/reference baseline,
- JavaScriptCore + UIKit — independent iOS semantic/native reference lane.

The pinned Hermes V1 Sting candidate built successfully behind the isolated Hermes/JSI → C++ adapter → C ABI → Zig path, but it failed a generic ECMAScript preflight for per-iteration `for (let ...)` lexical closure semantics before SolidJS-specific behavior became decisive. That exact candidate is therefore disqualified for v0.1. This must not be generalized into a claim that SolidJS 2 does not work with Hermes; a future Hermes version can be reconsidered if it passes the complete JavaScript and Solid/Sting conformance suite and offers a compelling benefit.

Physical Android evidence still measures startup, memory, event/native-update latency, module overhead, frame behavior, binary size, and other representative workloads. That evidence validates and characterizes the accepted QuickJS direction. A severe correctness or performance blocker can reopen the decision, but normal architecture work no longer preserves engine indecision while waiting for every benchmark result. See [`performance.md`](performance.md) and [`decisions/0004-production-javascript-engine.md`](decisions/0004-production-javascript-engine.md).

The embedding architecture remains intentionally narrow:

- official QuickJS is driven through its C API from the Zig-centered portable runtime,
- QuickJS-NG may use the equivalent C embedding shape while the secondary lane remains inexpensive to retain,
- the historical Hermes prototype stays behind a small isolated C++/JSI adapter with a C ABI,
- application packages, renderer APIs, and native modules must not import engine-specific public types.

Do not create a permanent public multi-engine abstraction merely because multiple evaluation lanes exist.

## Renderer model

JavaScript owns a lightweight shadow host tree. Each host node has a stable numeric ID, parent/child relationships, properties, and JS-side event handlers. Native receives mutations instead of being synchronously queried for tree structure.

Benefits:

- Solid renderer operations such as `getParentNode` and `getNextSibling` remain cheap and deterministic.
- The bridge stays mutation-oriented.
- Native code never needs to understand Solid's owner graph.
- Unit tests can run against an in-memory bridge.
- Fine-grained signal updates can remain fine-grained native mutations instead of entering a general virtual-tree reconciliation pass.

## Threading

For v0.1, JavaScript execution and native UI mutations are serialized on the main thread. Native modules may perform genuinely asynchronous work on background queues/threads, but **all JavaScript-engine entry and Promise completion must be marshalled back to the single thread that owns the runtime**.

On Android, JNI is the narrow internal Zig/C ↔ Kotlin boundary. `JNIEnv` is thread-local and must never be reused as though it were a process-global engine handle. A background Kotlin completion must return to the runtime-owning Android Looper before entering JNI/Zig/QuickJS. On iOS, background native completion similarly returns to the main queue before entering JavaScriptCore.

A future dedicated JavaScript thread can replace main-thread ownership without changing this invariant: one runtime owner thread, explicit marshalling before every engine entry. See [`android-runtime.md`](android-runtime.md) and [`decisions/0005-async-native-modules-and-runtime-threading.md`](decisions/0005-async-native-modules-and-runtime-threading.md).

## Layout

Do not block the first renderer proof on a complete cross-platform layout engine. The initial native views support a deliberately tiny style/layout subset sufficient for the example. A later v0.1 decision will compare native layout primitives with an independent layout engine such as Yoga. Using Yoga would not imply a React Native dependency, but it should only be introduced if cross-platform consistency justifies the additional native dependency.

## Versioned runtime contract

Every JS/native runtime instance exposes a protocol version. Breaking bridge changes require a protocol major-version change. Framework packages can negotiate additive capabilities so a development client can report a useful compatibility error instead of failing with undefined native calls.

Initial shape:

```ts
interface StingRuntimeInfo {
  protocolVersion: 1;
  platform: "ios" | "android";
  modules: Record<string, string>;
}
```

The async native-call work is additive to protocol v1: sync-only applications remain valid on sync-only v1 hosts, while `callAsync()` must fail clearly when the host lacks the async bridge capability. Future incompatible changes to existing operations or envelopes still require a protocol-major bump.

## Lifecycle

v0.1 defines runtime-created, app-mounted, foreground/background, and runtime-destroyed hooks. Native modules may subscribe through the registry rather than editing application delegate/activity code directly.

Runtime destruction is also part of async-module correctness: outstanding Promises are rejected before engine teardown, completion sinks are detached, and late native results are ignored rather than re-entering a destroyed runtime.

## Current implementation versus target architecture

Contributors should distinguish the verified reference lanes from the production portability target.

The v0.1 production path is:

```text
Solid / TypeScript
       ↓
Sting JS contracts
       ↓
official QuickJS
       ↓
Zig-centered Sting runtime
      ↙       ↘
   Swift     Kotlin
     ↓         ↓
   UIKit   Android Views
```

On Android, the Zig runtime reaches Kotlin through a narrow C ABI/JNI adapter; that adapter is an implementation detail rather than a public application or module API.

JavaScriptCore/UIKit remains the independent iOS semantic/native control. QuickJS-NG remains a secondary compatibility/performance lane while it provides useful independent evidence at low maintenance cost; it does not block production QuickJS feature work. The historical Hermes prototype remains evidence for the isolated-adapter architecture and for the generic JavaScript preflight failure that disqualified that tested candidate.

Public application APIs remain engine-independent even though the v0.1 implementation is deliberately converging on one production engine.

## Deliberately deferred

- navigation architecture
- OTA updates
- cloud builds/signing
- package autolinking beyond a minimal manifest scan
- production dev client
- app-store deployment
- generalized C++ core

Those become priorities only as the native renderer/event/module loop and measured runtime foundation mature.
