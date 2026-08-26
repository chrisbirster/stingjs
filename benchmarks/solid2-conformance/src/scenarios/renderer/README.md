# Renderer torture workstream

Branch: `feature/solid2-conformance-renderer`

This lane drives the real Solid 2 RC universal renderer through Sting's native host and records every bridge mutation. It deliberately uses signal setters plus `flush()` as deterministic controls: no timers, network, DOM, WebView, or engine-specific behavior is required.

Coverage includes:

- text -> text with exact `replaceText` identity/count checks
- text -> component and component -> text replacement mutation checks
- text/component -> null and null -> component
- array -> array structural replacement
- anchored array reorder/move behavior with stable native identity
- native detach followed by keyed reinsertion of the same registered identity
- event deactivation while detached and reactivation on reinsertion
- nested subtree replacement and deep parent detach
- rapid property changes with per-update mutation assertions
- event handler replacement/removal through the real Sting event registry
- parent detach with deep event-bearing descendants
- repeated mount/remove cycles with fresh conditional component IDs
- no stale callbacks while nodes are detached or disposed
- no duplicate/ghost attached native nodes
- JS/native attached-tree identity parity and parent/child bookkeeping
- unrelated sentinel identity preservation

The native contract distinguishes **registration** from **attachment**. `removeNode` detaches an identity from its parent and disables its events, but the native registry retains the identity because Solid's keyed universal reconciler may legally reinsert it later. A detached node must be absent from the connected tree and unable to dispatch events; reinsertion of that same identity is valid and must reactivate retained handlers. This matches Sting's JavaScript host and the UIKit node registry rather than inventing permanent-destruction semantics at every detach.

Performance phases record samples, min, mean, p50, p95, p99, max, and relevant native mutation counts for rapid property writes, array reorder stress, and repeated mount/remove cycles.

The scenario wraps a real native bridge when one is installed (JSC/UIKit, QuickJS, QuickJS-NG, or Hermes hosts) and otherwise uses a deterministic no-op transport plus a strict native-shadow validator. The validator rejects invalid anchors, unknown node IDs, duplicate registrations, and inconsistent attached parent/child mutations while allowing legal detach/reinsert moves.

The host behavior exercised here lives in `packages/core/src/host.ts` with focused unit coverage in `packages/core/src/host.test.ts`. Sting disables subtree events before native detach, retains source handlers weakly, and reactivates those handlers if the same host identity is inserted again without changing Solid semantics.
