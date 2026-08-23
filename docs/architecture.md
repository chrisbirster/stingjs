# StingJS architecture

## Goal

StingJS provides a native application platform for SolidJS with an Expo-like developer experience, without React Native, Expo runtime dependencies, or a WebView rendering layer.

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

The first proof is iOS-first and uses Apple's JavaScriptCore framework because it is built into iOS and lets us prove the architecture without introducing a large runtime dependency.

JavaScript execution is behind a Sting runtime interface. Android is therefore not required to use JavaScriptCore. Before the Android proof we will evaluate Hermes and QuickJS/QuickJS-NG against startup size, async/Promise integration, debugging, maintenance, and embedding complexity.

This is deliberately an implementation choice, not a public API contract.

## Renderer model

JavaScript owns a lightweight shadow host tree. Each host node has a stable numeric ID, parent/child relationships, properties, and JS-side event handlers. Native receives mutations instead of being synchronously queried for tree structure.

Benefits:

- Solid renderer operations such as `getParentNode` and `getNextSibling` remain cheap and deterministic.
- The bridge stays mutation-oriented.
- Native code never needs to understand Solid's owner graph.
- Unit tests can run against an in-memory bridge.

## Threading

For v0.1, JavaScript execution and native UI mutations are serialized on the main thread. This is not the long-term performance model; it is the smallest correct model for proving semantics. We will not introduce background queues until profiling identifies a need and the ordering contract is explicit.

## Layout

Do not block the first renderer proof on a complete cross-platform layout engine. The initial native views will support a deliberately tiny style/layout subset sufficient for the example. A later v0.1 decision will compare native layout primitives with an independent layout engine such as Yoga. Using Yoga would not imply a React Native dependency, but it should only be introduced if cross-platform consistency justifies the additional native dependency.

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

## Deliberately deferred

- navigation architecture
- OTA updates
- cloud builds/signing
- package autolinking beyond a minimal manifest scan
- production dev client
- app-store deployment
- generalized C++ core

Those only become priorities after the renderer → native event → signal update → native mutation loop works on a real device/simulator.
