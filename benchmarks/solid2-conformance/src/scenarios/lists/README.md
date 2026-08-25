# Lists / identity workstream

Branch: `feature/solid2-conformance-lists`

This directory owns the Solid 2 list conformance lane. The exported `scenario` is discovered automatically by the shared harness.

## Covered semantics

- `<For>` keyed by item/reference identity
  - append, prepend, middle insert
  - remove first/middle/last
  - replace with a new item reference
  - filter and expand
  - sort, reverse, and explicit move/reorder
  - retained native identity across structural moves
  - no unrelated create/remove/text/property/event replay
- `<For keyed={false}>` positional semantics
  - positional native identities stay fixed
  - item accessors update only changed positions
  - append/insert allocate only new tail positions
  - removals dispose only tail positions
  - sort/reverse/reorder are text/data updates, not native moves
- `<Repeat>`
  - RC count-based semantics (not array diffing)
  - `count` plus `from`
  - growth preserves the existing prefix
  - shrink removes only excess rows
- fine-grained row content
  - sparse 1-row updates emit exactly one `replaceText`
  - dense 100-of-10K updates emit exactly 100 `replaceText`

## Scale and benchmark coverage

The scenario records `samples`, `min`, `mean`, `p50`, `p95`, `p99`, and `max` for:

- mount 1K
- mount 10K
- middle insert 1K
- middle remove 1K
- reverse 1K
- sort 1K
- sparse update 1-of-10K
- dense update 100-of-10K
- filter 10K → 5K
- expand 5K → 10K

Each benchmark also records mean native mutation counts for:

- `createElement`
- `createTextNode`
- `replaceText`
- `setProperty`
- `insertNode`
- `removeNode`
- `setEventEnabled`

Correctness assertions run before benchmark interpretation. Any failed identity or mutation invariant makes the scenario fail rather than producing a misleading performance comparison.

## Determinism

All controls are direct signal writes followed by Solid 2 `flush()`. The lane uses no timers, network requests, DOM, WebViews, or engine-specific behavior. Native identity is read from Sting's host shadow tree and native mutation counts come from a recording implementation of the real `StingNativeBridge` contract.

Run the lane through the workspace gates:

```sh
npm run typecheck
npm test
npm run build
```

The child PR targets `feature/solid2-conformance-train`; do not retarget this lane to `dev`.
