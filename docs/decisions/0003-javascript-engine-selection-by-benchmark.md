# ADR 0003: Select the production JavaScript engine by benchmark evidence

- Status: proposed
- Date: 2026-08-23

## Context

ADR 0001 selected JavaScriptCore only to prove the first iOS renderer/event/module semantics. That choice deliberately avoided deciding the production engine.

StingJS now has a stronger runtime requirement: ordinary applications should perform in the same general class as comparable modern React Native applications. Architectural simplicity is valuable, but not if it causes a material application-level performance deficit.

QuickJS is attractive because its C embedding API maps naturally into a Zig-centered runtime. QuickJS-NG may provide materially different maintenance, platform, or performance characteristics. Hermes is the current React Native default and is therefore both a candidate Sting engine and the most relevant baseline engine.

## Decision

Do not select a production JavaScript engine yet.

Build three comparable Sting runtime prototypes:

1. official QuickJS,
2. QuickJS-NG,
3. Hermes.

Build a current React Native + Hermes reference application implementing the same benchmark workloads.

The production engine decision is blocked on the benchmark program in `docs/performance.md`.

## Architecture constraint

The portable Sting runtime remains centered in Zig.

QuickJS and QuickJS-NG may be embedded through their C APIs directly from Zig.

Hermes may use JSI and a small C++ adapter, but that adapter must expose a narrow C ABI to Zig and must not absorb Sting-owned renderer, bridge, module, lifecycle, or platform-neutral runtime semantics.

Conceptually:

```text
QuickJS / QuickJS-NG
        -> C API
        -> Zig Sting runtime

Hermes / JSI
        -> tiny C++ adapter
        -> C ABI
        -> Zig Sting runtime
```

Do not introduce a generalized public engine abstraction until at least one engine works end-to-end and prototype duplication reveals a stable common contract.

## Renderer constraint

The engine investigation must not change Solid's update model. A single fine-grained Solid dependency update should be able to produce a single Sting native mutation when that is the semantic result.

Do not add a virtual DOM or component-tree reconciliation pass for engine portability.

## Baseline

The reference implementation is a current bare React Native release using its default Hermes runtime. At the time of this ADR, React Native 0.87 is the current active release and Hermes V1 has been the default since React Native 0.84.

The React Native application must be implemented credibly and optimized in ordinary documented ways; it must not be intentionally handicapped to improve Sting's comparison.

## Decision criteria

The final ADR must include measured evidence for:

- cold and warm startup,
- memory,
- native binary/runtime size,
- JavaScript bundle or bytecode size,
- raw JavaScript execution,
- Solid propagation through the actual native view update,
- event-to-JS and event-to-visible-update latency,
- native-module call latency,
- async call overhead,
- view creation/destruction,
- sparse and dense partial updates,
- list frame pacing and memory,
- navigation/mount/unmount lifetime behavior,
- debugging, inspector, and source-map support,
- iOS/Android integration and maintenance burden,
- licensing and ecosystem maturity.

Latency-sensitive measurements should report p50/p95/p99 where practical and be interpreted against 60 Hz and 120 Hz frame budgets.

## Possible outcomes

### QuickJS

Choose official QuickJS if application performance remains comparable and the simpler direct C/Zig integration is a meaningful advantage.

### QuickJS-NG

Choose QuickJS-NG if its maintenance, platform work, or measurable performance is materially preferable while retaining the C/Zig integration benefits.

### Hermes

Choose Hermes if QuickJS-family engines produce a meaningful real-application deficit and Hermes materially closes it. An isolated C++ dependency is acceptable in that outcome.

### Multiple engines later

Multiple engines may be useful eventually, but supporting more than one production engine is explicitly deferred. Prototype code is not a promise of a permanent `JavaScriptEngine` public abstraction.

## Consequences

- JavaScriptCore remains only the initial iOS proof runtime.
- Android engine work is no longer allowed to select an engine based on integration convenience alone.
- Performance instrumentation must be designed into the runtime/bridge as those layers are built.
- Physical-device release-build results are required before the production runtime choice is finalized.
- Some duplicated prototype glue is acceptable during the evaluation phase.
