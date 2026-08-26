# Realistic composed app workstream

Branch: `feature/solid2-conformance-real-app`

This lane owns `benchmarks/solid2-conformance/src/scenarios/real-app/` and exports the completed suite as `scenario` from `index.tsx`.

## Workload

The scenario is a deterministic native contacts/task-style application rather than an isolated primitive test. It uses the real Solid 2 RC runtime plus Sting's `@solidjs/universal` renderer and combines:

- a Solid context/provider consumed by nested components;
- a `createStore` data set with 1,000 records in the rendered application;
- a second 10,000-record store-backed search/filter/sort compute workload;
- search, active/all filtering, ascending/descending keyed sorting, and selection;
- form-like draft edits driven by supported native `Button` primitives;
- native row-selection, edit, filter, sort, retry, save, lifecycle, and Haptics button events;
- controlled Promise loading, stale refresh, rejection, `<Errored>` retry, and recovery;
- a controlled `AsyncIterable` stream that patches a live store record;
- generator-based `action()` plus `createOptimistic()` success and rollback paths;
- `<Show>`, `<Switch>`, `<Match>`, `<Loading>`, `<Errored>`, and `<For>` composition;
- detail subtree mount/unmount cleanup and stale-callback checks;
- keyed list identity across sort and retained-item identity across filter/search;
- a synchronous native `Haptics.impact("medium")` bridge call;
- full application unmount/remount and late-stream/stale-event checks.

No timers or network are used. Promise completion, rejection, stream yields, and save settlement are exposed through deterministic controls captured by the scenario driver, while user-like interactions are dispatched through Sting's native event path.

## Deterministic phases

The scenario records correctness and timing for:

1. cold mount;
2. native row selection;
3. form-like edit;
4. search and clear-search;
5. filter and clear-filter;
6. keyed sort/reorder;
7. native module call;
8. stale async refresh;
9. async error/retry/recovery;
10. stream update;
11. optimistic save/commit;
12. optimistic rejection/rollback;
13. detail unmount/remount;
14. full application unmount/remount;
15. 10K search/filter/sort compute passes.

Hot phases assert native identity and prohibit unrelated element/text creation, property replay, insertion/removal, and event rebinding. Structural phases assert exact row cardinality, retained keyed identity, stale callback teardown, and a coherent connected native tree with no duplicate/ghost nodes.

For `<Errored>` recovery, the semantic requirement is topology and behavior rather than allocation policy: the failed ready subtree must be disconnected while the error fallback is active, retry must recover the correct value, and settlement must leave exactly one connected `refresh-ready` subtree with no ghost nodes. The pinned Solid RC may either reuse/reactivate the prior native identity or allocate a new one; the workload intentionally accepts both valid strategies.

Timing distributions use `samples`, `min`, `mean`, `p50`, `p95`, `p99`, and `max`. Canonical phases also emit native mutation counts for element/text creation, `replaceText`, property writes, inserts, removes, event enable/disable, module calls, and total bridge operations.

This workload is evidence for engine selection only after focused semantic suites pass. It does not independently choose QuickJS, QuickJS-NG, Hermes, or JavaScriptCore.
