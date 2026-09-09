# StingJS transport hot-path evidence

Issue #15 asked whether the original JSON proof transport should remain the default bridge shape or whether frequently exercised runtime operations should move to typed Zig ABI paths.

## Cohort

The measurement runs in the normal PR Gate against official QuickJS `2026-06-04`, through the QuickJS C API into Zig host callbacks, compiled with Zig 0.16.0 `ReleaseFast` on the hosted Ubuntu 24.04 runner. Each ordinary scenario records 41 samples of 1,000 operations after warmup; Promise resolution records 21 samples of 100 operations. The benchmark reports p50/p95/p99 nanoseconds per operation. JSON paths also report encoded payload bytes as a serialization-cost proxy; allocator instrumentation is intentionally not claimed.

Exact evidence cohort: PR #132, head `2b4efc88119f48ee5cb14202231c6445af36f4b5`, PR Gate run `33700271179`, `StingRuntime / Official QuickJS` job `100477884047`.

| Scenario | JSON p50 | Typed p50 | p50 speedup | JSON bytes |
| --- | ---: | ---: | ---: | ---: |
| text property | 1,402 ns | 75 ns | 18.69x | 24 |
| numeric property | 1,617 ns | 78 ns | 20.73x | 18 |
| string property | 1,273 ns | 97 ns | 13.12x | 34 |
| boolean property | 1,241 ns | 68 ns | 18.25x | 19 |
| module int/string call | 1,028 ns | 70 ns | 14.69x | 12 |
| Promise result | 2,020 ns | 1,480 ns | 1.36x | 22 |
| event stream | 608 ns | 107 ns | 5.68x | 27 |

Structured fallback measurements, where no useful primitive ABI exists yet:

- style object JSON fallback: p50 3,574 ns, p95 3,798 ns, p99 3,849 ns, 75 encoded bytes;
- structured module payload JSON fallback: p50 2,296 ns, p95 2,317 ns, p99 2,317 ns, 64 encoded bytes.

The same exact-head job also passed the official QuickJS engine benchmark, Sting smoke workload, Solid 2 async semantics, and the full Solid 2 conformance suite.

## Decision

StingJS should use typed native transport for primitive and identity-heavy hot paths where the public semantic shape is already known: node ids, parent/child ids, booleans, numbers, strings/text, event enablement, request ids, and similarly fixed module arguments/results.

JSON remains an acceptable deliberate fallback for structured values whose shape is genuinely dynamic or evolving, including compound style payloads and structured module data. A generic public `any`/value ABI is not justified by this evidence and would weaken the existing architecture boundary.

Promise completion should not be rewritten solely for the measured 1.36x primitive serialization win; the larger async scheduling/lifecycle contract dominates that path. Typed Promise result payloads can be adopted opportunistically when the result schema is already fixed.

## Consequence

This evidence resolves the transport-direction question in #15. It does **not** replace the physical-device performance characterization required by #5. Hosted-runner nanosecond values are useful for within-cohort relative transport cost, not as end-user device latency claims.
