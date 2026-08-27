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

## Decision gate

This ADR must not be changed to `Status: accepted` until checked-in schema-v1 evidence includes release physical-device coverage for both surviving candidates and the React Native/Hermes baseline on iOS and Android.

At minimum the decision review must cover:

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

Raw results live under `benchmarks/results/raw/` and are validated by `npm run benchmark:results -- validate ...`. The v0.1 release gate independently requires physical-device provenance and cross-platform coverage.

## Current decision

No production engine is selected yet. Do not infer a winner from CI smoke timings, simulator measurements, ease of embedding, or the fact that the Android proof host currently uses the official QuickJS candidate.

## Acceptance edit

When the matrix is complete, replace the header with:

```text
- Status: accepted
- Date: YYYY-MM-DD
- Engine: quickjs | quickjs-ng
```

and append the measured decision matrix plus rationale below this section. The accepted decision must link the exact raw evidence files used.
