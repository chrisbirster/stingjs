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

## One-command Android collection

Connect one real Android phone with Developer Options and USB debugging enabled, authorize the development machine, and confirm it appears as `device` in:

```bash
adb devices
```

Local prerequisites:

- Node.js 22+ and npm;
- Android SDK with platform/build tools 36;
- Android NDK `28.2.13676358`;
- `ANDROID_SDK_ROOT` set;
- Zig `0.16.0`;
- Gradle available on `PATH` for the Sting Android project;
- exactly one authorized Android device connected;
- a clean Git worktree on the exact commit being measured.

Run:

```bash
npm run benchmark:physical:android
```

The wrapper refuses emulators and dirty worktrees. It then:

1. builds the shared Sting benchmark bundle;
2. builds a signed **Release** Sting APK containing both pinned QuickJS-family candidates;
3. installs the Release app and instrumentation APK on the connected phone;
4. captures Sting + official QuickJS sparse/dense samples;
5. captures Sting + QuickJS-NG sparse/dense samples;
6. generates the pinned bare React Native 0.87 + Hermes baseline;
7. builds and installs its Release app/instrumentation APK;
8. captures the equivalent RN/Hermes sparse/dense native-event-to-visible-update samples;
9. pulls all three capture documents from the phone;
10. converts them into schema-v1 evidence, validates them, and writes a deterministic summary.

Output is placed under:

```text
.artifacts/benchmarks/android-physical/<benchmark-commit>/
  captures/
  evidence/
  summary.json
```

The wrapper does **not** automatically commit evidence. Review the generated files first, then copy the reviewed schema-v1 files into `benchmarks/results/raw/` on the evidence/decision branch.

## Sparse workload

The benchmark mounts 10,000 logical/native rows and repeatedly updates row 4,281.

For Sting, each measured sample requires:

- one actual native Android button event;
- one Solid fine-grained row computation;
- exactly one `replaceText` native mutation;
- no element/text creation, property replay, insert/remove churn, or event-registration churn;
- one native event -> JS/Solid -> native commit round-trip sample.

For React Native, instrumentation starts at the same native control interaction and ends when the actual native row `TextView` changes.

Current capture policy:

- 5 warmup iterations;
- 30 retained samples;
- raw latency samples retained;
- Sting native mutation count asserted before the capture is emitted.

## Dense workload

The same 10,000-row tree updates the same 100 deterministic row IDs per sample.

For Sting the capture requires exactly 100 `replaceText` mutations and no structural/native replay outside those text mutations. For React Native the native observer waits until all 100 target native row views have committed their new text before ending the sample.

This records dense cost directly rather than extrapolating it from the sparse case.

## Evidence cohort rules

`npm run release:check:v0.1` requires all three systems to provide both sparse and dense `native-event-to-visible-update-latency` evidence and verifies that the comparison cohort shares:

- exact benchmark Git commit;
- physical Android device model;
- device architecture;
- Android OS version;
- active display refresh rate;
- Release build provenance.

Required physical Android systems:

- Sting + official QuickJS;
- Sting + QuickJS-NG;
- React Native 0.87 + Hermes baseline.

The pinned Sting/Hermes candidate is not required because the conformance train disqualified that exact runtime on JavaScript lexical semantics.

## iOS simulator compatibility

The iOS simulator remains release-blocking for correctness, not performance ranking. The selected runtime path must build and run the representative Sting application and public native primitive suite through UIKit on the simulator.

Simulator measurements may be kept under `.artifacts/` for diagnostics, but they must be labeled as simulator data and never imported through `benchmark:import-evidence` into `benchmarks/results/raw/`.

## iOS JavaScriptCore control capture

When a physical iPhone is available later, the existing JSC control collector can validate UIKit timing boundaries on-device:

```bash
npm run benchmark:ios-jsc-control
```

It produces a document marked `role: semantic-control` and `engine: javascriptcore`; never convert that control document into production-engine evidence.

## Import and validate reviewed captures

The one-command wrapper already creates schema-v1 evidence in its artifact directory. For any separately produced candidate capture, the strict importer remains available:

```bash
npm run benchmark:import-evidence -- \
  .artifacts/benchmarks/candidate-capture.json \
  benchmarks/results/raw
```

Validate checked-in evidence with:

```bash
npm run benchmark:results -- validate benchmarks/results/raw
```

The importer rejects simulator/emulator provenance, debug builds, JavaScriptCore decision evidence, malformed samples, and invalid React Native engine combinations.
