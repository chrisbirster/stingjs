# Engine-to-Zig transport benchmark

This benchmark answers issue #15: whether the JavaScriptCore proof bridge's JSON serialization should remain on hot runtime paths or whether Sting should use typed primitive calls where the semantic operation is already known.

It is deliberately a **transport diagnostic**, not production-engine selection evidence. Results are host measurements and must not be copied into `benchmarks/results/raw/` as physical-device data.

## Compared modes

The same JavaScript workload invokes a Zig-backed host function through each engine in two forms:

- `json`: JavaScript builds JSON, Zig receives a string and parses it;
- `typed`: JavaScript passes the known primitive fields directly and Zig converts them from engine values.

Structured values are represented field-by-field only to measure the upper bound of avoiding serialization on known hot operations. This benchmark does not propose exposing `JSValue` or creating a large public generic-value system.

## Scenarios

Both modes run the seven workloads required by #15:

1. one text/property update;
2. repeated numeric/string/bool properties;
3. a small structured style object;
4. native-module integer/string call;
5. native-module structured-object call;
6. Promise-based result;
7. event-stream payload.

Each sample performs 5,000 host calls. The benchmark performs 5 warmup samples followed by 30 retained samples per engine/scenario/mode.

## Run

Requires Zig 0.16.0, a C toolchain, `make`, CMake, Git, curl, and Node.js.

```bash
npm run benchmark:transport
```

The runner pins:

- official QuickJS `2026-06-04` by archive SHA-256;
- QuickJS-NG `v0.16.1` at `954dc53628e36891f93c359aa60895c2ae3dac6b`.

It writes:

```text
.artifacts/benchmarks/transport/
  quickjs.log
  quickjs-ng.log
  summary.json
```

`summary.json` retains the per-call raw sample values and reports min, mean, p50, p95, p99, max, plus JSON/typed p50 ratios.

## Interpretation

Use the results to decide internal transport encoding, not the production JavaScript engine. A material typed-path win supports specialized primitive ABI functions for common Sting operations while preserving a structured fallback for uncommon/complex payloads. If the difference is negligible, the maintenance cost of additional typed paths may not be justified.

The public Sting semantic operation contract remains engine-neutral regardless of the result.
