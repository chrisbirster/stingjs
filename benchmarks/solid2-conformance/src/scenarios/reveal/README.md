# Reveal workstream

Branch: `feature/solid2-conformance-reveal`

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

Cover at minimum:

- Reveal ordering modes supported by the pinned Solid 2 RC
- nested Reveal boundaries
- Reveal with Loading
- Reveal with Errored
- Reveal with multiple async dependencies
- Reveal with AsyncIterable streams
- ordering after rejection/recovery
- native insertion/replacement ordering
- no unrelated native subtree rebuilds

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
