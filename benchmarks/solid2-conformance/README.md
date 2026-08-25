# Solid 2 Conformance + Benchmark Train

This workspace is the broad compatibility and performance gate used before Sting selects a production JavaScript engine.

## Branch model

The integration branch is:

`feature/solid2-conformance-train`

Ten child branches are cut from the same scaffold commit. Each child branch owns exactly one directory under `src/scenarios/<workstream>/` and should target the integration branch, never `dev` directly.

The root harness discovers `src/scenarios/*/index.tsx` with a Vite build-time glob, so adding a scenario suite does not require editing a shared registry file.

## Scenario contract

Every workstream exports one `scenario` object from:

`src/scenarios/<workstream>/index.tsx`

The exported object must satisfy `ScenarioDefinition` from `src/harness/types.ts`.

A scenario may contain many deterministic assertions and many benchmark phases. Correctness assertions should fail loudly. Performance measurements are recorded separately and must not turn a semantic failure into a benchmark result.

## Merge protocol

1. Start from the assigned child branch.
2. Keep work scoped to that workstream directory unless a genuinely shared harness fix is required.
3. Run workspace typecheck/build plus any workstream-specific tests.
4. Open the child PR against `feature/solid2-conformance-train`.
5. Merge only after the child checks are green.
6. After all ten workstreams are integrated, run the complete suite under JavaScriptCore/UIKit, official QuickJS, QuickJS-NG, and Hermes.
7. Run the performance matrix and realistic-app workload on the same physical iOS/Android devices for surviving engines.
8. Promote the integration branch to `dev` only after the complete gate is green.

## Engine decision rule

Correctness comes first. Any candidate that cannot execute the required Solid 2/Sting corpus correctly is disqualified before performance is considered.

No workstream should introduce a public permanent engine abstraction or select an engine independently.
