# StingJS benchmarks

This directory contains performance evidence, not marketing demos.

## Layout

```text
benchmarks/
  js-engine/                 # portable JavaScript CPU probes
  shared/                    # deterministic fixtures/workload contracts
  sting-benchmark/           # SolidJS + Sting native application
  react-native-benchmark/    # React Native + Hermes reference application
  results/                   # raw + summarized physical-device results
```

The mobile applications must implement equivalent user-visible behavior and data sizes. Framework-specific implementation details may differ when that is the idiomatic way to achieve the same result.

## Benchmark integrity

- Release builds only for engine-selection evidence.
- Same physical device for direct comparisons.
- Same OS version and display refresh setting.
- Pin every engine/framework revision.
- Record raw samples and p50/p95/p99 for latency-sensitive tests.
- Simulator/emulator runs are regression/smoke tests, not final evidence.
- Do not check in hand-edited result summaries without the raw source samples used to produce them.

See `docs/performance.md` for the required workloads and engine-decision gate.

## Native measurement boundaries

The iOS JavaScriptCore control host has an opt-in `StingPerformanceDiagnostics` recorder. It uses `DispatchTime`'s monotonic native clock and records nothing unless diagnostics are explicitly enabled when creating the runtime/host.

Current iOS metrics are:

- `runtime.bundle-evaluate` — JavaScriptCore bundle evaluation including synchronous initial Sting native work triggered during evaluation.
- `bridge.create-element`
- `bridge.create-text-node`
- `bridge.replace-text`
- `bridge.set-property`
- `bridge.insert-node`
- `bridge.remove-node`
- `bridge.set-event-enabled`
- `bridge.call-module-sync`
- `event.<event>-round-trip` — native event dispatch through JavaScript/Solid and all synchronous native work completed before the JavaScript event call returns.

These metrics intentionally surround actual native bridge/view/module operations. They are useful boundaries, but they do not by themselves complete the engine decision: startup phases outside bundle evaluation, process RSS/leaks, rendered frame pacing, binary size, and equivalent physical-device instrumentation for each production-engine candidate and the React Native/Hermes baseline are still required.

## First implementation order

1. Keep the existing JavaScriptCore hello-world path as the semantic control.
2. Make the portable `js-engine` probes run unchanged in official QuickJS, QuickJS-NG, and Hermes.
3. Add a Sting QuickJS prototype with the smallest possible Zig/C integration.
4. Repeat with QuickJS-NG.
5. Add a Hermes prototype using a tiny JSI/C++ -> C ABI adapter -> Zig boundary.
6. Generate the bare React Native 0.87 reference app and implement the same workloads.
7. Add on-device instrumentation around the actual Sting native bridge and native views.
8. Collect release-build physical-device data before accepting an engine ADR.
