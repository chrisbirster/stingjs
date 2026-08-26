# Physical-device benchmark collection

This runbook separates two kinds of data:

1. **semantic/control captures** used to prove that Sting's native measurement boundaries surround real UIKit work;
2. **engine-selection evidence** used to compare QuickJS, QuickJS-NG, Hermes, and the React Native + Hermes baseline.

JavaScriptCore is the iOS semantic control. It is intentionally **not** accepted by `schema-v1.json` as production-engine evidence.

## iOS JavaScriptCore control capture

Use a connected physical iPhone. The test target is built in `Release` configuration and drives the real Sting benchmark buttons through UIKit.

Required environment:

```bash
export STING_IOS_DEVICE_ID='<physical-device-udid>'
export STING_IOS_DEVICE_NAME='<device model/name>'
export STING_IOS_OS_VERSION='<ios version>'
export STING_IOS_REFRESH_HZ='60' # or the active device setting
# If signing requires an explicit team:
export STING_IOS_DEVELOPMENT_TEAM='<team id>'
```

Run:

```bash
npm run benchmark:ios-jsc-control
```

Output defaults to:

```text
.artifacts/benchmarks/ios-jsc-control.xcodebuild.log
.artifacts/benchmarks/ios-jsc-control.json
```

The JSON document is marked:

```json
{
  "role": "semantic-control",
  "engine": "javascriptcore"
}
```

Do not copy this control document into `benchmarks/results/` and do not convert it into production-engine evidence.

## Sparse workload

The benchmark mounts 10,000 logical/native rows and repeatedly updates row 4,281.

The control capture requires, for each measured sample:

- one native button event;
- one Solid fine-grained row computation;
- exactly one `replaceText` native mutation;
- no element/text creation, property replay, insert/remove churn, or event-registration churn;
- one native event -> JS/Solid -> native commit round-trip sample.

Current capture policy:

- 5 warmup iterations;
- 30 retained samples;
- raw round-trip samples retained;
- raw native `replaceText` durations retained;
- mutation count asserted before the capture is emitted.

## Dense workload

The same 10,000-row tree updates 100 deterministic row IDs per sample.

The control capture requires:

- one native event per sample;
- exactly 100 `replaceText` mutations per sample;
- no structural/native replay outside those text mutations;
- 30 retained round-trip samples and all underlying native mutation durations.

This deliberately records the dense cost rather than extrapolating it from the sparse case.

## Production engine evidence

Final engine-selection files belong under `benchmarks/results/` and must validate with:

```bash
npm run benchmark:results -- validate benchmarks/results
```

Direct comparisons must use:

- the same physical device;
- the same OS version;
- the same active refresh rate;
- release builds;
- the same benchmark commit;
- the same workload/data sizes;
- retained raw samples;
- pinned engine/framework versions.

Required Sting candidate runs:

- official QuickJS;
- QuickJS-NG;
- Hermes through the isolated C++/JSI -> C ABI -> Zig adapter.

Required control baseline:

- React Native 0.87 + Hermes.

JavaScriptCore control captures validate the native instrumentation only and are not candidates in this comparison.

## Next native-host integration

Candidate mobile hosts should emit the same logical measurements as the JSC control path:

- startup/bundle-evaluation timing at the native runtime boundary;
- native event round trip;
- native mutation timing and mutation count;
- synchronous native-module timing;
- sparse 10k one-row update;
- dense 10k 100-row update.

Once a candidate host produces raw samples, wrap each measured metric in `schema-v1.json` metadata and check the raw evidence into `benchmarks/results/` before making an engine decision.
