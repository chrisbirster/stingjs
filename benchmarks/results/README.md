# Runtime-engine evidence results

This directory is the checked-in evidence boundary for the StingJS runtime-engine decision.

The decision still compares:

- official QuickJS,
- QuickJS-NG,
- Sting/Hermes through the isolated C++/JSI -> C ABI -> Zig adapter,
- React Native 0.87 + Hermes as the external baseline.

Nothing in this directory selects a winner. It exists so physical-device measurements are reproducible, machine-checkable, and comparable without hand-editing summaries.

## Layout

```text
benchmarks/results/
  README.md
  schema-v1.json
  tool.mjs
  tool.test.mjs
  candidate-capture.mjs
  candidate-capture.test.mjs
  candidate-evidence-cli.mjs
  raw/               # checked-in physical-device result JSON files
  summaries/         # generated summaries derived from raw files
```

`raw/` and `summaries/` appear once real evidence is collected. Do not commit simulator/emulator measurements as final engine-selection evidence.

## Raw result contract

Each raw JSON file represents one measured metric and contains the complete raw sample set used for its summary.

```json
{
  "schemaVersion": 1,
  "metadata": {
    "benchmarkCommit": "0123456789abcdef0123456789abcdef01234567",
    "recordedAt": "2026-08-26T20:00:00.000Z",
    "platform": "ios",
    "environment": "physical-device",
    "device": "iPhone model",
    "deviceArchitecture": "arm64",
    "osVersion": "iOS version",
    "build": "release",
    "system": "sting",
    "engine": "quickjs-ng",
    "engineVersion": "v0.16.1",
    "frameworkVersion": "Solid 2 RC / Sting commit",
    "displayRefreshHz": 120,
    "sampleCount": 100,
    "toolchain": {
      "xcode": "version",
      "zig": "0.16.0"
    }
  },
  "measurement": {
    "scenario": "sparse-10k-row-update",
    "metric": "state-to-native-visible-latency",
    "unit": "ms",
    "direction": "lower-is-better",
    "samples": [1.1, 1.2, 1.0]
  }
}
```

The example above is illustrative only; it is not benchmark evidence.

Required invariants enforced by `tool.mjs`:

- `benchmarkCommit` is a full 40-character Git commit SHA.
- `environment` is exactly `"physical-device"`; simulator/emulator captures are rejected.
- published evidence is from `build: "release"` only.
- `sampleCount` exactly matches the retained raw sample count.
- all samples are finite, non-negative numbers.
- React Native evidence uses Hermes.
- Sting evidence uses one of `quickjs`, `quickjs-ng`, or `hermes`.
- JavaScriptCore control captures are not accepted as decision evidence.
- platform, system, engine, units, and metric direction use stable enums.
- timestamps must be valid ISO-8601 values.

Optional `toolchain`, `tags`, and `notes` fields may retain benchmark-specific context without changing the core schema.

## Import candidate-host captures

Candidate mobile hosts should first produce a capture document with shared metadata plus one or more raw measurements. The document must declare:

```json
{
  "captureDocumentVersion": 1,
  "role": "decision-evidence",
  "metadata": {
    "environment": "physical-device",
    "build": "release",
    "system": "sting",
    "engine": "quickjs-ng"
  },
  "captures": []
}
```

The remaining metadata fields match the raw result contract above except `sampleCount`, which is derived separately for every capture.

Convert the document into one schema-v1 evidence file per metric:

```bash
npm run benchmark:import-evidence -- .artifacts/benchmarks/candidate-capture.json benchmarks/results/raw
```

The importer validates every generated result before writing it and refuses to overwrite an existing evidence filename. It rejects:

- `javascriptcore` as decision evidence,
- simulator/emulator provenance,
- debug builds,
- React Native with a non-Hermes engine,
- malformed or empty raw sample sets,
- duplicate scenario/metric filenames.

This import path is deliberately stricter than copying profiler output by hand.

## Validate evidence

From the repository root:

```bash
npm run benchmark:results -- validate benchmarks/results/raw/<file>.json
```

Multiple files or directories may be supplied. Directories are traversed recursively for `.json` files. `schema-v1.json` is ignored by the evidence scanner.

Validation exits non-zero on malformed evidence. This is intentionally stricter than accepting whatever a platform profiler happens to print.

## Generate deterministic summaries

```bash
npm run benchmark:results -- summarize benchmarks/results/raw > benchmarks/results/summaries/latest.json
```

For every input result, the tool preserves the identifying metadata and emits:

- sample count,
- minimum,
- mean,
- p50,
- p95,
- p99,
- maximum.

Percentiles use the nearest-rank definition over sorted raw samples. For millisecond metrics, the summary also records the display frame budget (`1000 / displayRefreshHz`) and the number/percentage of samples exceeding that budget.

Generated summaries are derivative. The raw files remain authoritative and must be retained so statistics can be recalculated.

## Physical-device collection rules

Before recording a direct comparison:

1. use release builds with development tooling disabled,
2. run the systems on the same physical device,
3. keep OS version and refresh-rate settings identical,
4. pin engine/framework/compiler revisions in metadata,
5. record cold startup separately from warmed workloads,
6. retain every raw sample used for reported percentiles,
7. record device-native timing/memory/frame evidence where the benchmark requires it,
8. never substitute simulator/emulator results for the final engine decision.

A benchmark is not complete merely because JavaScript timers produce numbers. State -> native view, native event -> JS -> visible update, memory/RSS, frame pacing, startup phases, native modules, binary/bundle size, and lifecycle/leak loops require the native measurement boundaries described in `docs/performance.md`.

## Naming convention

The candidate importer writes stable filenames from system, engine, platform, scenario, and metric. Checked-in evidence may additionally be organized under dated/device-specific subdirectories when multiple comparable runs are retained.

Do not put device serial numbers, account identifiers, or other unnecessary machine/user identifiers in checked-in evidence.
