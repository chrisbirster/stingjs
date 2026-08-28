# Lifecycle / ownership workstream

Branch: `feature/solid2-conformance-lifecycle`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- createRoot ownership
- createEffect / createRenderEffect settlement semantics
- onSettled and cleanup ordering
- nested owners and disposal
- context ownership and teardown
- conditional subtree creation/disposal
- async computation disposal
- event-handler cleanup
- repeated mount/unmount cycles
- 1K/10K lifecycle stress
- native node/event reference leak detection

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
