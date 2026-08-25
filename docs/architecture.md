# StingJS architecture

## Goal

StingJS provides a native application platform for SolidJS with an Expo-like developer experience, without React Native, Expo runtime dependencies, or a WebView rendering layer.

If you are trying to understand the concrete path from `App.tsx` and Vite to a running UIKit application, start with [`how-sting-runs.md`](how-sting-runs.md). This document focuses on the architectural boundaries and invariants behind that pipeline.

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
@stingjs/core module client
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

### `@stingjs/solid`

Adapts Solid 2 universal rendering to the Sting host contract. Solid's custom-renderer API is intentionally contained here because renderer APIs can evolve independently of Sting's public API.

As of August 2026, Solid 2 publishes its universal renderer separately as `@solidjs/universal`. Sting will pin a tested Solid release and change this adapter when Solid changes; app code must not depend on the upstream renderer contract.

### `@stingjs/native`

Provides developer-facing components (`View`, `Text`, `Button`, then `Image`, `TextInput`, and `ScrollView`) and their TypeScript props. These components target Sting host elements rather than DOM elements.

### Native runtime

The runtime owns actual native objects, applies mutations, dispatches native events back into JavaScript, and hosts the native-module registry. The native runtime must not know about Solid signals or component semantics.

## JavaScript engine strategy

JavaScript-engine choice is an implementation decision behind the Sting runtime contract, not part of the public application API.

The first verified iOS native proof uses Apple's JavaScriptCore framework because it is built into iOS and allowed us to prove the renderer → native event → Solid signal → precise native mutation loop without first introducing a large runtime dependency.

The runtime-engine evaluation now also exercises three candidate embeddings against the same real Solid/Sting semantic workload:

- official QuickJS,
- QuickJS-NG,
- Hermes V1 matching the React Native 0.87 Hermes generation.

All three candidate hosts have successfully run the current semantic gates on macOS:

```text
counter press       → exactly 1 replaceText + Haptics medium
10k sparse update   → exactly 1 replaceText
10k dense update    → exactly 100 replaceText
```

This establishes compatibility with the current Sting renderer semantics. It does **not** select the production engine.

Engine selection still requires comparable release-build evidence for startup, memory, native-event latency, module-call latency, list/frame behavior, lifecycle, bundle/binary size, and physical-device p50/p95/p99 measurements. See [`performance.md`](performance.md).

The embedding architecture remains intentionally narrow:

- QuickJS and QuickJS-NG can be driven through their C APIs from Zig,
- Hermes can sit behind a small isolated C++/JSI adapter with a C ABI,
- application packages and the renderer must not import engine-specific APIs.

## Renderer model

JavaScript owns a lightweight shadow host tree. Each host node has a stable numeric ID, parent/child relationships, properties, and JS-side event handlers. Native receives mutations instead of being synchronously queried for tree structure.

Benefits:

- Solid renderer operations such as `getParentNode` and `getNextSibling` remain cheap and deterministic.
- The bridge stays mutation-oriented.
- Native code never needs to understand Solid's owner graph.
- Unit tests can run against an in-memory bridge.
- Fine-grained signal updates can remain fine-grained native mutations instead of entering a general virtual-tree reconciliation pass.

## Threading

For v0.1, JavaScript execution and native UI mutations are serialized on the main thread. This is not the long-term performance model; it is the smallest correct model for proving semantics. We will not introduce background queues until profiling identifies a need and the ordering contract is explicit.

## Layout

Do not block the first renderer proof on a complete cross-platform layout engine. The initial native views support a deliberately tiny style/layout subset sufficient for the example. A later v0.1 decision will compare native layout primitives with an independent layout engine such as Yoga. Using Yoga would not imply a React Native dependency, but it should only be introduced if cross-platform consistency justifies the additional native dependency.

## Versioned runtime contract

Every JS/native runtime instance exposes a protocol version. Breaking bridge changes require a protocol major-version change. Framework packages can negotiate capabilities so a development client can report a useful compatibility error instead of failing with undefined native calls.

Initial shape:

```ts
interface StingRuntimeInfo {
  protocolVersion: 1;
  platform: "ios" | "android";
  modules: Record<string, string>;
}
```

## Lifecycle

v0.1 defines runtime-created, app-mounted, foreground/background, and runtime-destroyed hooks. Native modules may subscribe through the registry rather than editing application delegate/activity code directly.

## Current implementation versus target architecture

Contributors should distinguish the verified implementation from the longer-term portability target.

The current native iOS proof is:

```text
Solid / TypeScript
       ↓
Sting JS contracts
       ↓
Swift JavaScriptCore host
       ↓
UIKit
```

The runtime-engine prototypes are establishing how the portable runtime can own alternative engines, including direct Zig/C paths for QuickJS-family engines and a narrow C ABI around Hermes' C++/JSI API.

Do not prematurely introduce a public multi-engine abstraction merely because benchmark prototypes exist. The engine should remain an internal runtime choice until evidence justifies the production architecture.

## Deliberately deferred

- navigation architecture
- OTA updates
- cloud builds/signing
- package autolinking beyond a minimal manifest scan
- production dev client
- app-store deployment
- generalized C++ core
- final production JavaScript-engine selection

Those become priorities only as the native renderer/event/module loop and measured runtime foundation mature.
