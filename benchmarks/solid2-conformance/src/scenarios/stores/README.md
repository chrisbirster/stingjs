# Stores / projections workstream

Branch: `feature/solid2-conformance-stores`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- createStore basic reads/writes
- nested object mutation
- array push/splice/delete/reorder
- draft-first setters
- derived stores
- projections where available
- 10K-record store with one sparse field update
- dense 100-of-10K updates
- exact native mutation counts for visible store dependencies
- representative store update benchmarks

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
