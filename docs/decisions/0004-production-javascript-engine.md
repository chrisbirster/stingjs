# ADR 0004: Production JavaScript engine for StingJS v0.1

- Status: blocked-on-physical-evidence
- Date: 2026-08-26
- Engine: undecided

## Context

ADR 0003 requires the production runtime to be selected by application-level evidence rather than integration convenience. The Solid 2 conformance train is complete and the same representative bundle/corpus has been exercised through JavaScriptCore/UIKit, official QuickJS, QuickJS-NG, and Hermes prototype hosts.

The pinned Hermes V1 candidate used for React Native 0.87 was disqualified as a Sting production candidate by the generic JavaScript language preflight because it failed standard per-iteration `for (let ...)` lexical closure semantics. Hermes remains the external React Native baseline; the disqualification does not make React Native an invalid baseline.

The surviving Sting candidates are therefore:

- official QuickJS `2026-06-04`,
- QuickJS-NG `v0.16.1`.

For v0.1, physical benchmark hardware is available for Android but not for iOS. The decision must therefore distinguish physical performance evidence from iOS simulator compatibility evidence instead of pretending simulator timings represent an iPhone.

## Decision gate

This ADR must not be changed to `Status: accepted` until checked-in schema-v1 evidence includes release physical-device Android coverage for both surviving Sting candidates and the React Native/Hermes baseline on the same Android device.

The selected runtime must also remain green through the iOS simulator/UIKit software matrix. iOS simulator timing may be retained as diagnostic data, but it must not be promoted into `benchmarks/results/raw/`, used to rank mobile hardware performance, or described as physical iPhone evidence.

At minimum the decision review must cover on physical Android hardware:

- cold/warm startup,
- resident memory and leak-sensitive lifecycle loops,
- state -> visible native update latency,
- native event -> JS and complete event -> visible update latency,
- native-module calls,
- sparse 1-of-10K and dense 100-of-10K updates,
- large-list frame pacing/memory,
- view creation/removal/reorder,
- JS CPU workloads,
- binary/bundle size,
- bridge serialization/typed ABI evidence,
- debugging/tooling,
- build and maintenance burden.

Cross-platform correctness additionally requires the selected runtime path and public native primitives to remain compatible with the iOS simulator/UIKit host before v0.1 release.

Raw physical results live under `benchmarks/results/raw/` and are validated by `npm run benchmark:results -- validate ...`. Physical iPhone performance validation is deferred until suitable hardware is available and must be added as follow-up evidence rather than retroactively representing simulator numbers as device measurements.

## Current decision

No production engine is selected yet. Do not infer a winner from CI smoke timings, simulator measurements, ease of embedding, or the fact that the Android proof host currently uses the official QuickJS candidate.

## Acceptance edit

When the Android physical matrix is complete, replace the header with:

```text
- Status: accepted
- Date: YYYY-MM-DD
- Engine: quickjs | quickjs-ng
```

and append the measured decision matrix plus rationale below this section. The accepted decision must link the exact Android physical evidence files used and explicitly note that physical iPhone performance validation remains deferred.
