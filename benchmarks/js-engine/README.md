# Portable JavaScript engine probes

`engine-bench.js` is intentionally dependency-free and avoids Node-specific APIs so the same source can run under multiple engines.

The first comparison set is:

- official QuickJS `2026-06-04`,
- QuickJS-NG pinned to the exact release/commit under test,
- Hermes V1 matching the React Native reference generation,
- Node only as a local smoke/control runtime (not an engine candidate).

## Example invocations

The exact executable paths depend on how the prototype runtimes are built:

```sh
node benchmarks/js-engine/engine-bench.js
qjs benchmarks/js-engine/engine-bench.js
hermes benchmarks/js-engine/engine-bench.js
```

Each invocation emits one JSON object containing raw summary statistics for the same workloads.

## Important limitation

These probes deliberately measure JavaScript CPU/runtime behavior only. They cannot answer the Sting engine question by themselves.

The engine decision requires the mobile measurements in `docs/performance.md`, especially:

- startup,
- memory,
- signal -> actual native view latency,
- event round trips,
- native-module calls,
- list frame pacing,
- binary/bundle size.

Do not promote the fastest result in this directory to a framework decision without the application-level data.
