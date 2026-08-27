# Device benchmark collection

This runbook separates three kinds of data:

1. **semantic/control captures** used to prove that Sting's native measurement boundaries surround real platform work;
2. **physical engine-selection evidence** used to rank production candidates;
3. **simulator compatibility evidence** used to prove an unavailable physical platform remains buildable and semantically correct.

JavaScriptCore is the iOS semantic control. It is intentionally **not** accepted by `schema-v1.json` as production-engine evidence.

## v0.1 hardware policy

For v0.1, a physical Android device is available but a physical iPhone is not.

Therefore:

- production-engine performance ranking uses **release builds on one physical Android device**;
- official QuickJS, QuickJS-NG, and React Native 0.87 + Hermes must be measured on that same Android device;
- iOS uses the simulator/UIKit matrix for build, semantic, primitive, and selected-runtime compatibility;
- iOS simulator timing is diagnostic only and must never be checked into `benchmarks/results/raw/` as physical evidence;
- no v0.1 documentation may claim measured iPhone performance parity;
- physical iPhone performance validation is deferred until hardware is available.

This is deliberately stricter than pretending simulator numbers are comparable to phone hardware.

## iOS JavaScriptCore control capture

When a physical iPhone is available, the existing JSC control collector can validate UIKit timing boundaries on-device. Without physical iPhone hardware, use the normal iOS simulator CI/runtime tests as compatibility evidence instead.

The control capture, when used on a physical phone, runs with:

```bash
npm run benchmark:ios-jsc-control
```

and produces a document marked:

```json
{
  "role": "semantic-control",
  "engine": "javascriptcore"
}
```

Do not copy this control document into `benchmarks/results/raw/` and do not convert it into production-engine evidence.

## Sparse workload

The benchmark mounts 10,000 logical/native rows and repeatedly updates row 4,281.

The capture requires, for each measured sample:

- one native button event;
- one Solid fine-grained row computation;
- exactly one `replaceText` native mutation;
- no element/text creation, property replay, insert/remove churn, or event-registration churn;
- one native event -> JS/Solid -> native commit round-trip sample.

Current capture policy:

- 5 warmup iterations;
- 30 retained samples;
- raw round-trip samples retained;
- raw native mutation durations retained;
- mutation count asserted before the capture is emitted.

## Dense workload

The same 10,000-row tree updates 100 deterministic row IDs per sample.

The capture requires:

- one native event per sample;
- exactly 100 `replaceText` mutations per sample;
- no structural/native replay outside those text mutations;
- 30 retained round-trip samples and all underlying native mutation durations.

This deliberately records the dense cost rather than extrapolating it from the sparse case.

## v0.1 production engine evidence

Final engine-selection files belong under `benchmarks/results/raw/` and must validate with:

```bash
npm run benchmark:results -- validate benchmarks/results/raw
```

For v0.1, direct performance comparisons must use:

- the same physical Android device;
- the same Android OS version;
- the same active refresh rate;
- release builds;
- the same benchmark commit;
- the same workload/data sizes;
- retained raw samples;
- pinned engine/framework versions.

Required physical Android runs:

- Sting + official QuickJS;
- Sting + QuickJS-NG;
- React Native 0.87 + Hermes baseline.

The pinned Sting/Hermes candidate is not required because the conformance train disqualified that exact runtime on JavaScript lexical semantics.

## iOS simulator compatibility

The iOS simulator remains release-blocking for correctness, not performance ranking. The selected runtime path must build and run the representative Sting application and public native primitive suite through UIKit on the simulator.

Simulator measurements may be kept under `.artifacts/` for diagnostics, but they must be labeled as simulator data and never imported through `benchmark:import-evidence` into `benchmarks/results/raw/`.

## Candidate capture import

Once an Android candidate host produces raw physical-device samples, convert them into schema-v1 evidence with:

```bash
npm run benchmark:import-evidence -- \
  .artifacts/benchmarks/candidate-capture.json \
  benchmarks/results/raw
```

The importer rejects simulator/emulator provenance, debug builds, JavaScriptCore decision evidence, malformed samples, and invalid React Native engine combinations.

## What the user needs to run for v0.1

The target end-state is one command with the Android phone connected that collects all three required systems:

```bash
npm run benchmark:physical:android
```

That command should build/run Sting + QuickJS, Sting + QuickJS-NG, and RN + Hermes in Release mode on the connected phone and emit importable capture documents. Until that wrapper exists, physical collection is still repository implementation work rather than a manual benchmark procedure the user is expected to assemble.
