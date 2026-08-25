# Reactivity workstream

Branch: `feature/solid2-conformance-reactivity`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- synchronous signals and memos
- memo chains and diamond graphs
- dynamic dependency addition/removal
- multiple subscribers and fanout
- equality/comparator behavior where applicable
- nested writes and automatic microtask batching
- explicit `flush()` behavior
- reads before/after settlement
- 1, 10, 100, 1K and 10K subscriber/update benchmark shapes
- exact Sting native mutation counts for representative visible dependencies

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
