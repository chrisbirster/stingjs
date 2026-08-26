# Control-flow workstream

Branch: `feature/solid2-conformance-control-flow`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- Show
- Switch / Match
- Dynamic
- null/defined branch transitions
- text ↔ component transitions
- nested conditional subtrees
- branch replacement ordering
- native node creation/removal counts
- native identity preservation for unaffected siblings
- event-handler teardown/rebinding correctness

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
