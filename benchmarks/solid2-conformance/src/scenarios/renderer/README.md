# Renderer torture workstream

Branch: `feature/solid2-conformance-renderer`

This lane drives the real Solid 2 RC universal renderer through Sting's native host and records every bridge mutation. It deliberately uses signal setters plus `flush()` as deterministic controls: no timers, network, DOM, WebView, or engine-specific behavior is required.

Coverage includes:

- text -> text with exact `replaceText` identity/count checks
- text -> component and component -> text replacement ordering
- text/component -> null and null -> component
- array -> array structural replacement
- anchored array reorder/move behavior with stable native identity
- nested subtree replacement and deep parent removal
- same-value property and serialized-object property deduplication
- rapid property changes with per-update mutation assertions
- event handler replacement/removal without native enable replay
- node removal with events attached
- parent removal with deep event-bearing descendants
- repeated mount/remove cycles with fresh IDs
- removed node IDs rejecting later property/text/insert reuse
- no stale callbacks after disposal
- no unattached/ghost native nodes
- JS/native shadow-tree identity parity and parent/child bookkeeping
- unrelated sentinel identity preservation

Performance phases record samples, min, mean, p50, p95, p99, max, and relevant native mutation counts for rapid property writes, array reorder stress, and repeated mount/remove cycles.

The scenario wraps a real native bridge when one is installed (JSC/UIKit, QuickJS, QuickJS-NG, or Hermes hosts) and otherwise uses a deterministic no-op transport plus a strict native-shadow validator. The validator rejects invalid anchors, operations against retired IDs, duplicate node IDs, and inconsistent parent/child mutations.

The host hardening required by this lane lives in `packages/core/src/host.ts` with focused unit coverage in `packages/core/src/host.test.ts`. It adds final property/event dedupe, subtree event teardown, retired-node rejection, structural-cycle protection, and no-op move suppression without changing Solid semantics.
