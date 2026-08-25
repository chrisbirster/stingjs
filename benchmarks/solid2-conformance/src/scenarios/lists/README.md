# Lists / identity workstream

Branch: `feature/solid2-conformance-lists`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- For keyed behavior
- For keyed={false} behavior
- Repeat where available
- insert/remove at beginning/middle/end
- filter 10K → 5K → 10K
- sort and reverse
- move/reorder without unnecessary recreation
- sparse row content updates
- 1K and 10K list mount/update benchmarks
- native node identity and exact create/insert/remove mutation counts

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
