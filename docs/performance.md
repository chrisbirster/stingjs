# StingJS performance program

Performance is an architectural requirement for StingJS, not a post-v1 optimization project.

The minimum product goal is:

> A well-built StingJS application should have runtime performance in the same general class as a comparable modern React Native application on equivalent hardware.

StingJS does not need to win every JavaScript microbenchmark. It does need to avoid a meaningful application-level performance penalty for choosing SolidJS and the Sting runtime.

## Current baseline and engine lanes

As of August 2026, the external reference baseline is React Native 0.87 in release mode with its default Hermes V1 runtime. React Native 0.84 made Hermes V1 the default; 0.87 is the active release used when this benchmark program was created.

The current Sting engine lanes are intentionally asymmetric:

1. **official QuickJS `2026-06-04`** — v0.1 production runtime,
2. **QuickJS-NG** — temporary secondary conformance/performance lane; the tested release must be pinned by commit/tag in benchmark metadata,
3. **historical Sting/Hermes V1 prototype** — retained as implementation/conformance evidence, but disqualified for v0.1 after failing a generic ECMAScript per-iteration lexical-closure preflight,
4. **JavaScriptCore/UIKit** — independent iOS semantic/native reference lane,
5. **React Native 0.87 + Hermes** — external competitor/reference baseline.

The Hermes result is specific to the tested Sting candidate. It must not be summarized as a general claim that SolidJS 2 cannot run on Hermes.

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

## Engine-lane rule

ADR 0004 selects official QuickJS `2026-06-04` as the StingJS v0.1 production engine. Normal Sting applications do not choose an engine, and benchmark lanes must not become a permanent public `JavaScriptEngine` abstraction.

New runtime and module capabilities target official QuickJS first. Keep QuickJS-NG compatible when doing so is inexpensive because it provides an independent conformance/performance signal and helps catch accidental reliance on an official-QuickJS-specific quirk. Reevaluate that lane after v0.1 stabilizes rather than treating dual-engine support as a product requirement.

The historical Hermes prototype used this contained architecture:

```text
Hermes / JSI
     -> isolated C++ adapter
     -> C ABI
     -> Zig Sting runtime
     -> Swift / Kotlin host
```

That architecture remains valid evidence, but the pinned Hermes V1 candidate itself is not a v0.1 Sting production contender after its generic ECMAScript preflight failure. C++ must not become the owner of Sting renderer, module, lifecycle, or platform-neutral runtime semantics.

## Measurement principles

- Compare the same behavior on the same physical device.
- Use release builds for published comparisons.
- Disable development tooling, debug overlays, Fast Refresh, and profilers unless the benchmark specifically measures tooling overhead.
- Pin framework, engine, compiler, OS, device, and benchmark commit versions in every saved result.
- Warm up where appropriate, but report cold-start measurements separately.
- Prefer distributions over averages: p50, p95, and p99 for latency metrics where sample counts are sufficient.
- Store raw samples when practical so statistics can be recalculated.
- Do not tune the React Native reference implementation to be artificially slow.
- Do not use pure JavaScript throughput as the production-engine validation criterion by itself.

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

Run for Sting/QuickJS, Sting/QuickJS-NG, and React Native/Hermes. Historical Sting/Hermes results may remain for reference where already available, but new v0.1 production work does not depend on that disqualified candidate.

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

These measurements explain engine behavior; they do not override correctness or application-level evidence.

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

Do not check in simulator/emulator numbers as physical-device performance evidence. They remain useful for semantic, compatibility, build, and regression testing where appropriate.

## Production QuickJS validation gate

ADR 0004 is already accepted. The following evidence validates and characterizes that decision rather than acting as a prerequisite for keeping unrelated architecture work moving:

1. official QuickJS runs the representative Solid/Sting bundle/workload contract across the production host paths,
2. QuickJS-NG remains available as an independent secondary lane while it is inexpensive to maintain,
3. React Native/Hermes remains runnable on the same physical Android device for external comparison,
4. startup, memory, event round-trip, native-module, sparse/dense reactivity, list, and JS CPU results are collected for the required release lanes,
5. p50/p95/p99 are available for latency-sensitive workloads where sample counts support them,
6. binary/bundle size and debugging/tooling implications are recorded,
7. leaks/lifetime issues are exercised,
8. the result matrix is reviewed for severe QuickJS correctness or performance blockers.

A severe blocker that materially threatens v0.1 can reopen ADR 0004. Otherwise, optimize and harden the accepted QuickJS path rather than returning to an open-ended engine bake-off.

## Runtime validation matrix

Fill this with measured values and evidence rather than adjectives where possible.

| Criterion | QuickJS | QuickJS-NG | Historical Sting/Hermes |
| --- | --- | --- | --- |
| v0.1 role | production | secondary validation lane | disqualified candidate |
| ECMAScript preflight | pass | pass | fail: per-iteration lexical closure |
| Zig integration | direct C API | direct C API | isolated C++/JSI -> C ABI |
| C++ dependency | no | no | yes, isolated adapter |
| startup | TBD | TBD | historical/reference only |
| memory | TBD | TBD | historical/reference only |
| native binary size | TBD | TBD | historical/reference only |
| bundle/bytecode size | TBD | TBD | historical/reference only |
| JS throughput | TBD | TBD | historical/reference only |
| Solid sparse-update latency | TBD | TBD | historical/reference only |
| Solid dense-update latency | TBD | TBD | historical/reference only |
| native-call latency | TBD | TBD | historical/reference only |
| native-event latency | TBD | TBD | historical/reference only |
| list frame pacing | TBD | TBD | historical/reference only |
| debugging / inspector | TBD | TBD | historical/reference only |
| source maps | TBD | TBD | historical/reference only |
| iOS support | TBD | TBD | historical/reference only |
| Android support | TBD | TBD | historical/reference only |
| maintenance | TBD | TBD | historical/reference only |
| licensing | MIT | MIT | MIT |
| ecosystem / production history | TBD | TBD | historical/reference only |

The React Native 0.87 + Hermes baseline is an external comparison and should be reported beside Sting results even though it is not a Sting production-engine candidate.

## Release rule

A Sting milestone is not considered performance-ready merely because CI is green. Once native runtime behavior is substantial enough to benchmark, performance regressions in core renderer/bridge paths become release-blocking when they materially harm frame pacing, startup, memory, or native interaction latency.
