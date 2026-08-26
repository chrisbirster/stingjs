# Actions / optimistic workstream

Branch: `feature/solid2-conformance-actions`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- basic action settlement
- multiple concurrent actions
- action failure paths
- scalar createOptimistic apply/rollback
- optimistic correction after server result
- object/array optimistic state
- createOptimisticStore where available
- action + async memo interaction
- action + unmount/disposal behavior
- exact native mutations for optimistic apply/correction/rollback

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
