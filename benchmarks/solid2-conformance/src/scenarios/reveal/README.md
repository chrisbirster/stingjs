# Reveal workstream

Branch: `feature/solid2-conformance-reveal`

PR: #24, targeting `feature/solid2-conformance-train` only.

Own this directory. Export the completed suite as `scenario` from `index.tsx`.

## Pinned Solid 2 RC surface

The harness pins `solid-js@2.0.0-rc.1`. Its actual `<Reveal>` API is intentionally tested rather than translating React SuspenseList vocabulary:

- `order="sequential"` — default registration-order frontier reveal.
- `order="together"` — direct slots remain on fallbacks until every direct slot is minimally ready, then release cohesively.
- `order="natural"` — each direct slot reveals independently; useful as a nested composite slot.
- `collapsed` — meaningful only for `sequential`; tail fallbacks beyond the frontier are suppressed. It is ignored by `together` and `natural`.

`forwards` and `backwards` are not `RevealOrder` values in this RC and are therefore not treated as aliases or compatibility modes.

Nested Reveal groups register as one composite slot in their parent. Once an outer group releases that slot, the inner group resumes its own local order. The suite also verifies Solid 2's "minimally ready" nesting rule rather than assuming all grandchildren must settle.

## Deterministic coverage

`index.tsx` exercises:

- sequential ordering and late resolution
- sequential `collapsed` frontier behavior
- together cohesive release, including ignored `collapsed`
- natural independent release, including ignored `collapsed`
- outer sequential + inner natural composition
- outer together + inner sequential minimally-ready composition
- multiple independent async branches
- Loading fallbacks under Reveal
- Errored rejection, reset, re-entry into pending ordering, and recovery
- AsyncIterable first-yield reveal, later streaming updates, and completion
- exact direct native insertion/removal ordering
- persistent native identity for unaffected/revealed siblings
- no unrelated property/event replay
- no stale fallback/ghost nodes
- exact one-`replaceText` streaming update with zero structural replay

All async work is driven by explicit Promise/AsyncIterator controls. There are no timers or network dependencies, and the stream avoids `async *` so it remains parsable by the pinned Hermes V1 generation used in the engine train.

## Benchmark phase

The hybrid scenario records 32 deterministic sequential-frontier-release samples and emits:

- samples
- min
- mean
- p50
- p95
- p99
- max
- native createElement/createTextNode/replaceText/setProperty/insertNode/removeNode/setEventEnabled counts

Native mutation counts must be identical across benchmark samples before timing results are accepted.

Do not select an engine and do not modify the shared registry unless the harness contract itself is genuinely insufficient.
