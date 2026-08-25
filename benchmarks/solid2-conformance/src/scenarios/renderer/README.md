# Renderer torture workstream

Branch: `feature/solid2-conformance-renderer`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- text ↔ component transitions
- component ↔ null transitions
- array ↔ array structural replacement
- deep conditional subtree disposal
- property write deduplication
- rapid property changes
- event handler replacement/removal
- node move/reorder behavior exposed by Solid control flow
- unaffected native identity preservation
- no ghost native nodes or stale callbacks after disposal
- mutation ordering and exact create/insert/remove/property/event counts

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
