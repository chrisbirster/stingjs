# Async stress workstream

Branch: `feature/solid2-conformance-async-stress`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- multiple subscribers to one async memo
- async memo depending on async memo
- multiple simultaneous promises
- rapid source changes
- race/supersession where stale A resolves after newer B
- stale content during refresh
- nested Loading / Errored behavior
- AsyncIterable first/subsequent yields
- iterator completion, empty completion and iterator error
- repeated stream yields
- exact native mutation counts for settle/yield paths

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
