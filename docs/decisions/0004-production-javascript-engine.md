# ADR 0004: Production JavaScript engine for StingJS v0.1

- Status: accepted
- Date: 2026-08-27
- Engine: official QuickJS `2026-06-04`
- Amendment: 2026-08-28 — QuickJS-NG frozen as an experimental/reference prototype; no product feature parity requirement

## Context

ADR 0003 established that Sting should evaluate JavaScript engines with application-level evidence rather than select an engine only because it is convenient to embed. That work produced independent Sting runtime prototypes and conformance lanes for official QuickJS, QuickJS-NG, and Hermes, while JavaScriptCore/UIKit remained the iOS semantic/native control and React Native + Hermes remained the external competitor baseline.

The historical benchmark and conformance work remains valid evidence and should not be rewritten as though QuickJS were predetermined from the start.

The SolidJS 2 conformance train and representative Sting workloads established that official QuickJS `2026-06-04` can run the required Solid/Sting semantics, including fine-grained native updates. QuickJS-NG also passed the historical Sting conformance work.

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

New runtime, renderer, Modules SDK, lifecycle, tooling, and first-party module features are implemented for the official QuickJS production path. They do **not** require QuickJS-NG feature parity.

## Rationale

The v0.1 decision is based on the combined correctness, architectural-fit, maintenance, and implementation evidence available as of this ADR:

1. **QuickJS passed Sting's SolidJS 2 conformance work.** The current representative Solid/Sting workloads execute with the required fine-grained semantics.
2. **QuickJS fits the Zig-centered runtime directly.** Its small C API can be called without moving Sting-owned runtime semantics into another language layer.
3. **No permanent C++/JSI runtime layer is required.** This keeps the production embedding surface smaller and better aligned with Sting's portable runtime design.
4. **Official QuickJS is actively maintained upstream.** Sting can track a named official release rather than owning a forked engine lineage.
5. **QuickJS-NG also passed historical tests, but dual production engines add unnecessary maintenance.** Continuing feature parity would multiply testing and architecture cost without demonstrated user benefit.
6. **The tested Hermes V1 candidate failed generic ECMAScript closure semantics.** That is a production correctness blocker for that candidate independent of SolidJS-specific behavior.
7. **React Native + Hermes remains valuable as an external baseline.** Sting still needs a comparison against the dominant ecosystem architecture it intends to compete with.
8. **Physical Android evidence remains important, but it validates and characterizes the accepted QuickJS direction instead of reopening routine product development.**

## Engine and reference lanes

The lanes are intentionally asymmetric:

- **official QuickJS `2026-06-04`** — Sting production runtime and release-blocking engine implementation.
- **QuickJS-NG `v0.16.1` at `954dc53628e36891f93c359aa60895c2ae3dac6b`** — frozen experimental/reference prototype preserving historical conformance and benchmark value. New Sting product features do not require parity. Its standalone smoke may remain as a non-blocking signal while inexpensive.
- **React Native 0.87 + Hermes** — external competitor/reference baseline.
- **JavaScriptCore + UIKit** — independent iOS semantic/native reference lane.

Do not add QuickJS-NG-specific renderer, module, lifecycle, developer-tooling, or first-party-module work merely to preserve parity with official QuickJS. If a shared change happens to remain compatible at negligible cost, that is acceptable; compatibility is not an acceptance criterion.

The historical QuickJS-NG prototype and benchmark evidence should remain available for research. It should be separated from normal application packaging and release gates where practical.

The RN/Hermes benchmark remains required even though Hermes is not Sting's production engine.

## Physical Android validation policy

A physical Android benchmark remains required to characterize the production decision. It no longer acts as a prerequisite for unrelated architecture work.

Release-facing comparison should prioritize:

- Sting + official QuickJS,
- React Native + Hermes,

on the same physical Android phone where comparisons are meaningful.

QuickJS-NG measurements may be retained as historical or optional research evidence but are not required for production release characterization.

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
- native binary/runtime size and JS bundle size,
- bridge serialization and typed-vs-JSON ABI cost,
- debugging/tooling,
- build and maintenance burden.

Use p50/p95/p99 where appropriate and interpret frame-sensitive latency against approximately 16.67 ms at 60 Hz and 8.33 ms at 120 Hz.

If physical evidence reveals a severe QuickJS correctness or performance blocker that materially threatens the release, reopen this decision. Otherwise optimize the accepted QuickJS path rather than resuming an open-ended engine bake-off.

## iOS evidence policy

For v0.1, JavaScriptCore/UIKit remains the independent iOS semantic/native control. The selected QuickJS production path must remain compatible with Sting's iOS build and native-view requirements.

iOS Simulator evidence remains release-blocking for buildability, semantics, native primitives, and integration correctness where appropriate. Simulator timings are diagnostic only and must never be represented as physical iPhone performance evidence.

Physical iPhone performance validation remains deferred until hardware is available.

## Consequences

- The portable Sting runtime converges around the official QuickJS production embedding instead of preserving engine indecision in normal architecture work.
- Modules SDK async calls, events, permissions, object handles, views, lifecycle, autolinking, and first-party modules target official QuickJS only as a production engine.
- Public application APIs remain engine-independent even though the implementation is intentionally single-engine for production.
- QuickJS-NG is frozen as research/reference code and is not a second supported product architecture.
- QuickJS-NG standalone CI is non-blocking; remaining coupling to ordinary Android app packaging should be removed separately.
- The Hermes prototype and its benchmark history remain documented evidence rather than being deleted.
- React Native + Hermes remains the external performance/reference baseline.
- ADR 0003 remains the historical methodology/evidence record; this ADR records the accepted production decision.

## Follow-up

Issue #5 tracks performance validation and characterization of the accepted QuickJS direction rather than engine selection itself. Issue #15 remains responsible for measuring the JSON proof bridge against typed Zig ABI hot paths before production transport details are frozen.
