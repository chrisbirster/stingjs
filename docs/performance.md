# StingJS performance program

Performance is an architectural requirement for StingJS, not a post-v1 optimization project.

The minimum product goal is:

> A well-built StingJS application should have runtime performance in the same general class as a comparable modern React Native application on equivalent hardware.

StingJS does not need to win every JavaScript microbenchmark. It does need to avoid a meaningful application-level performance penalty for choosing SolidJS and the Sting runtime.

## Current baseline

As of August 2026, the reference baseline is React Native 0.87 in release mode with its default Hermes V1 runtime. React Native 0.84 made Hermes V1 the default; 0.87 is the current active release when this benchmark program was created.

The Sting candidates are:

1. official QuickJS 2026-06-04,
2. QuickJS-NG (current tested release must be pinned by commit/tag in benchmark metadata),
3. Hermes V1 from the same React Native/Hermes generation used by the baseline.

JavaScriptCore is allowed to remain in the repository as the first iOS semantic proof. It is not the production runtime decision and does not satisfy this comparison.

## Central hypothesis

Solid's fine-grained reactivity may allow StingJS to perform less framework work than React Native for ordinary state changes.

For this Solid expression:

```tsx
const [count, setCount] = createSignal(0);
<Text>Count: {count()}</Text>
```

the desired update path is approximately:

```text
signal mutation
    -> one subscribed Solid computation
    -> one Sting mutation command
    -> one native text property update
```

Sting must not add a virtual DOM or React-style component-tree reconciliation layer to make the bridge easier to implement.

## Engine-prototype rule

The QuickJS, QuickJS-NG, and Hermes integrations are evaluation prototypes until the decision ADR is accepted.

Do not build a generalized public `JavaScriptEngine` abstraction merely because three prototypes exist. The prototypes may duplicate small amounts of glue while we learn what the real common boundary should be.

The product runtime remains Zig-centered. For QuickJS and QuickJS-NG, Zig may call the C embedding API directly. For Hermes, a small C++ adapter is acceptable:

```text
Hermes / JSI
     -> isolated C++ adapter
     -> C ABI
     -> Zig Sting runtime
     -> Swift / Kotlin host
```

C++ must not become the owner of Sting renderer, module, lifecycle, or platform-neutral runtime semantics.

## Measurement principles

- Compare the same behavior on the same physical device.
- Use release builds for published comparisons.
- Disable development tooling, debug overlays, Fast Refresh, and profilers unless the benchmark specifically measures tooling overhead.
- Pin framework, engine, compiler, OS, device, and benchmark commit versions in every saved result.
- Warm up where appropriate, but report cold-start measurements separately.
- Prefer distributions over averages: p50, p95, and p99 for latency metrics where sample counts are sufficient.
- Store raw samples when practical so statistics can be recalculated.
- Do not tune the React Native reference implementation to be artificially slow.
- Do not use pure JavaScript throughput as the engine-selection criterion by itself.

## Frame budgets

Interactive work must be interpreted against display frame budgets:

- 60 Hz: about 16.67 ms per frame,
- 120 Hz: about 8.33 ms per frame.

A low average is not sufficient if p95/p99 stalls routinely miss frame deadlines.

## Required benchmark groups

### 1. Startup

Measure separately:

1. native process launch -> JS runtime initialized,
2. runtime initialized -> bundle evaluated,
3. bundle evaluated -> first native view committed,
4. process launch -> application interactive.

Run for QuickJS, QuickJS-NG, Sting/Hermes, and React Native/Hermes.

### 2. Memory

Record resident memory and, where engine APIs permit it, JS heap statistics for:

- empty runtime,
- hello world,
- 1,000 native views,
- large list,
- repeated navigation/mount/unmount,
- repeated native-module calls,
- post-GC / settled state.

The benchmark must contain leak loops that repeatedly mount and destroy native objects and JS callbacks.

### 3. Solid reactivity

Measure complete state-to-native-view latency for:

- one signal -> one text update,
- one signal -> ten subscribed native views,
- update one item among 1,000,
- update 100 items among 10,000,
- create/remove reactive computations,
- conditional native insertion/removal.

The timer boundaries must include Solid propagation and the Sting bridge, not just `setSignal()` execution.

### 4. Native view operations

Measure:

- create 100 / 1,000 / 10,000 views,
- destroy the same sizes,
- update one property,
- update many properties,
- insert/remove children,
- reorder children,
- mount/unmount representative trees.

The 10,000-view case is a stress test, not a recommended UI design.

### 5. Events

Measure the full round trip:

```text
native input timestamp
    -> Swift/Kotlin
    -> Zig
    -> JS callback
    -> Solid signal
    -> Sting mutation
    -> actual native property applied
```

Record native-event-to-JS latency and complete event-to-visible-update latency separately.

### 6. Native modules

Measure:

- no-op synchronous call,
- integer argument/result,
- string argument/result,
- structured object,
- Promise-based asynchronous call,
- repeated calls,
- native event stream.

The objective is to identify bridge serialization, allocation, scheduling, and lifetime costs.

### 7. Lists

Build equivalent native list screens for Sting and React Native and measure:

- initial render,
- scroll frame pacing,
- insert/delete row,
- one-row update,
- many-row update,
- reorder,
- memory while scrolling,
- recycling/virtualization once Sting implements it.

Use the platform frame-timing tools in addition to JS timers.

### 8. JavaScript CPU

Use the same JavaScript source where engine differences permit:

- arithmetic loops,
- object allocation,
- arrays,
- Map/Set,
- JSON parse/stringify,
- Promise scheduling,
- async/await,
- closures,
- common immutable and mutable data transforms,
- Solid reactive computation creation/propagation.

These measurements explain engine behavior; they do not choose the winner by themselves.

## Critical Solid-vs-React benchmark

Maintain two variants.

### Sparse update

Create 10,000 logical rows and change only row 4,281. Measure from state mutation to the final native row property update.

The Sting target is one affected reactive computation and one native mutation after initial setup.

### Dense update

Change a realistic batch (for example 100 of 10,000 rows) in both applications. This prevents the suite from only measuring Solid's ideal sparse-update case.

Record both framework/JS work and complete visible-update latency.

## Comparable applications

The benchmark repository area is organized as:

```text
benchmarks/
  sting-benchmark/
  react-native-benchmark/
  shared/
  results/
```

Both applications should eventually expose the same screens/workloads:

- Counter,
- Large list,
- Form,
- Navigation,
- Async native call,
- Native event stream,
- Image list.

`shared` contains workload definitions and deterministic fixture generation, not framework code.

## Result metadata

Every checked-in result must include at least:

```json
{
  "benchmarkCommit": "<sha>",
  "platform": "ios|android",
  "device": "<physical device model>",
  "osVersion": "<version>",
  "build": "release",
  "system": "sting|react-native",
  "engine": "quickjs|quickjs-ng|hermes",
  "engineVersion": "<tag/sha>",
  "frameworkVersion": "<version>",
  "displayRefreshHz": 60,
  "sampleCount": 100
}
```

Do not check in simulator/emulator numbers as evidence for the final engine choice. They are useful for regression testing only.

## Engine decision gate

No production engine ADR can be accepted until:

1. all three Sting engine prototypes can evaluate the same representative bundle/workload contract,
2. the React Native/Hermes baseline is runnable on the same physical iOS and Android devices,
3. startup, memory, event round-trip, native-module, sparse/dense reactivity, list, and JS CPU results have been collected,
4. p50/p95/p99 are available for latency-sensitive workloads,
5. binary/bundle size and debugging/tooling implications are recorded,
6. leaks/lifetime issues have been exercised,
7. the result matrix is reviewed without assuming a predetermined winner.

## Runtime decision matrix

Fill this with measured values and evidence rather than adjectives where possible.

| Criterion | QuickJS | QuickJS-NG | Hermes |
| --- | --- | --- | --- |
| Zig integration | TBD | TBD | TBD |
| C++ dependency | no | no | yes, isolated adapter |
| startup | TBD | TBD | TBD |
| memory | TBD | TBD | TBD |
| native binary size | TBD | TBD | TBD |
| bundle/bytecode size | TBD | TBD | TBD |
| JS throughput | TBD | TBD | TBD |
| Solid sparse-update latency | TBD | TBD | TBD |
| Solid dense-update latency | TBD | TBD | TBD |
| native-call latency | TBD | TBD | TBD |
| native-event latency | TBD | TBD | TBD |
| list frame pacing | TBD | TBD | TBD |
| debugging / inspector | TBD | TBD | TBD |
| source maps | TBD | TBD | TBD |
| iOS support | TBD | TBD | TBD |
| Android support | TBD | TBD | TBD |
| maintenance | TBD | TBD | TBD |
| licensing | MIT | MIT | MIT |
| ecosystem / production history | TBD | TBD | TBD |

## Release rule

A Sting milestone is not considered performance-ready merely because CI is green. Once native runtime behavior is substantial enough to benchmark, performance regressions in core renderer/bridge paths become release-blocking when they materially harm frame pacing, startup, memory, or native interaction latency.
