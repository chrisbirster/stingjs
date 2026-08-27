# ADR 0004: Production JavaScript engine for StingJS v0.1

- Status: accepted
- Date: 2026-08-27
- Engine: official QuickJS `2026-06-04`

## Context

ADR 0003 established that Sting should evaluate JavaScript engines with application-level evidence rather than select an engine only because it is convenient to embed. That work produced independent Sting runtime prototypes and conformance lanes for official QuickJS, QuickJS-NG, and Hermes, while JavaScriptCore/UIKit remained the iOS semantic/native control and React Native + Hermes remained the external competitor baseline.

The historical benchmark and conformance work remains valid evidence and should not be rewritten as though QuickJS were predetermined from the start.

The SolidJS 2 conformance train and representative Sting workloads established that official QuickJS `2026-06-04` can run the required Solid/Sting semantics, including fine-grained native updates. QuickJS-NG also passed the current Sting conformance work.

Sting also successfully built the isolated Hermes architecture:

```text
Hermes / JSI
    ↓
tiny C++ adapter
    ↓
C ABI
    ↓
Zig Sting runtime
```

However, the pinned Hermes V1 candidate used during the Sting experiment failed a **generic JavaScript language preflight** on standard per-iteration `for (let ...)` lexical closure semantics before SolidJS itself became the deciding issue. Conceptually, callbacks created inside separate loop iterations did not preserve the required iteration-specific lexical binding.

This is basic ECMAScript behavior, so that Hermes candidate cannot safely serve as Sting's v0.1 production engine. This result must not be summarized as “SolidJS 2 does not work with Hermes.” It disqualifies the tested Hermes V1 Sting candidate for v0.1; it does not prove every Hermes version is incompatible with SolidJS 2.

## Decision

StingJS v0.1 selects **official QuickJS `2026-06-04`** as its production JavaScript engine.

The production runtime path is:

```text
SolidJS 2 + TypeScript
    ↓
@solidjs/universal
    ↓
@stingjs/solid
    ↓
@stingjs/core
    ↓
official QuickJS 2026-06-04
    ↓
Sting/Zig portable runtime
   ↙             ↘
Swift/iOS      Kotlin/Android
   ↓               ↓
UIKit         Android native Views
```

Normal Sting applications do not select a JavaScript engine. Sting will not expose a permanent public multi-engine abstraction for ordinary application code.

New runtime and native-module features should be implemented for the official QuickJS production path first.

## Rationale

The v0.1 decision is based on the combined correctness, architectural-fit, maintenance, and implementation evidence available as of this ADR:

1. **QuickJS passed Sting's SolidJS 2 conformance work.** The current representative Solid/Sting workloads execute with the required fine-grained semantics.
2. **QuickJS fits the Zig-centered runtime directly.** Its small C API can be called without moving Sting-owned runtime semantics into another language layer.
3. **No permanent C++/JSI runtime layer is required.** This keeps the production embedding surface smaller and better aligned with Sting's portable runtime design.
4. **Official QuickJS is actively maintained upstream.** Sting can track a named official release rather than owning a forked engine lineage.
5. **QuickJS-NG also passed, but dual production engines would add unnecessary v0.1 maintenance.** Supporting two production runtime implementations would multiply testing and architectural complexity without a demonstrated user benefit.
6. **The tested Hermes V1 candidate failed generic ECMAScript closure semantics.** That is a production correctness blocker for that candidate independent of SolidJS-specific behavior.
7. **React Native + Hermes remains valuable as an external baseline.** Sting still needs a comparison against the dominant ecosystem architecture it intends to compete with.
8. **Physical Android evidence remains important, but it now validates and characterizes the accepted QuickJS direction instead of delaying unrelated architecture work.**

## Secondary engine and reference lanes

The v0.1 engine lanes are intentionally asymmetric:

- **official QuickJS `2026-06-04`** — Sting production runtime.
- **QuickJS-NG `v0.16.1` at `954dc53628e36891f93c359aa60895c2ae3dac6b`** — temporary independent conformance/performance lane and guard against accidentally relying on an official-QuickJS-specific quirk.
- **React Native 0.87 + Hermes** — external competitor/reference baseline.
- **JavaScriptCore + UIKit** — independent iOS semantic/native reference lane.

Preserve QuickJS-NG compatibility and CI coverage when doing so is inexpensive, but do not double public APIs, runtime architecture, module surfaces, or developer tooling merely to support both engines indefinitely. After v0.1 stabilizes, reevaluate whether the QuickJS-NG lane still provides enough independent value to retain.

The RN/Hermes benchmark remains required even though Hermes is not Sting's production engine.

## Physical Android validation policy

A physical Android benchmark remains required to characterize the production decision. It no longer acts as a prerequisite for proceeding with the Modules SDK or other unrelated v0.1 architecture work.

Use Release builds of:

- Sting + official QuickJS,
- Sting + QuickJS-NG,
- React Native + Hermes,

on the same physical Android phone where comparisons are meaningful.

Continue collecting evidence for:

- cold/warm startup,
- resident memory and leak-sensitive lifecycle/module loops,
- sparse updates,
- dense updates,
- state -> actual native view mutation latency,
- native event -> JS latency,
- complete native event -> native mutation latency,
- native-module sync/async/event overhead,
- frame presentation/frame pacing,
- view creation/destruction/reorder,
- large-list frame pacing and memory,
- raw JS CPU behavior,
- native binary/runtime size and JS bundle/bytecode size,
- bridge serialization and typed-vs-JSON ABI cost,
- debugging/tooling,
- build and maintenance burden.

Use p50/p95/p99 where appropriate and interpret frame-sensitive latency against approximately 16.67 ms at 60 Hz and 8.33 ms at 120 Hz.

If physical evidence reveals a severe QuickJS correctness or performance blocker that materially threatens v0.1, reopen this decision. Otherwise optimize the accepted QuickJS path rather than resuming an open-ended engine bake-off.

## iOS evidence policy

For v0.1, JavaScriptCore/UIKit remains the independent iOS semantic/native control. The selected QuickJS production path must remain compatible with Sting's iOS build and native-view requirements.

iOS Simulator evidence remains release-blocking for buildability, semantics, native primitives, and integration correctness where appropriate. Simulator timings are diagnostic only and must never be represented as physical iPhone performance evidence.

Physical iPhone performance validation remains deferred until hardware is available.

## Consequences

- The portable Sting runtime can now converge around the official QuickJS production embedding instead of preserving engine indecision in normal architecture work.
- Modules SDK async calls, events, permissions, object handles, views, and autolinking should target official QuickJS first.
- Public application APIs must remain engine-independent even though the v0.1 implementation is not engine-agnostic internally.
- QuickJS-NG stays useful as an independent compatibility signal without becoming a second product architecture.
- The Hermes prototype and its benchmark history remain documented evidence rather than being deleted.
- React Native + Hermes remains the external performance/reference baseline.
- ADR 0003 remains the historical methodology/evidence record; this ADR records the accepted production decision.

## Follow-up

Issue #5 now tracks performance validation and characterization of the accepted QuickJS direction rather than engine selection itself. Issue #15 remains responsible for measuring the JSON proof bridge against typed Zig ABI hot paths before production transport details are frozen.
