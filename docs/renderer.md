# Renderer contract

## Upstream Solid 2 API

Solid's universal renderer is the correct upstream primitive for StingJS: it exists specifically for custom targets such as native mobile, desktop, Canvas/WebGL, and terminals.

Sting does not expose the upstream renderer directly. `@stingjs/solid` translates Solid renderer operations into a Sting-owned host interface.

## Required Solid host operations

The current universal renderer contract requires the equivalent of:

- create element
- create text node
- replace text
- set property
- insert child before an optional anchor
- remove child
- identify text nodes
- get parent
- get first child
- get next sibling

The Sting shadow tree implements structural queries locally. Creation/property/insertion/removal/text changes emit native mutations.

## Host node

```ts
interface HostNode {
  readonly id: number;
  readonly type: string;
  readonly text: boolean;
  parent: HostNode | null;
  children: HostNode[];
}
```

The exact fields are internal; node identity is the important contract.

## Mutation bridge

The first protocol contains these operations:

```ts
interface NativeMutationBridge {
  createElement(id: number, type: string): void;
  createTextNode(id: number, value: string): void;
  replaceText(id: number, value: string): void;
  setProperty(id: number, name: string, value: unknown): void;
  insertNode(parentId: number, nodeId: number, anchorId: number | null): void;
  removeNode(parentId: number, nodeId: number): void;
  setEventEnabled(id: number, event: string, enabled: boolean): void;
}
```

Native values crossing the initial JavaScriptCore bridge are JSON-compatible. Typed binary/shared objects are deferred until there is a measured requirement.

## Events

Event callback functions never cross into native code. For a property such as `onPress`, the JS runtime stores the callback and tells native only that the event is enabled.

Native emits:

```text
(node id, event name, serializable payload)
```

The Sting JS runtime resolves the handler and invokes it inside the active Solid runtime. If the handler updates a signal, Solid reruns only the dependent computation and the resulting host mutation is sent back to native.

This is the key v0.1 proof:

```text
UIButton tap
  → dispatchEvent(buttonId, "press")
  → onPress()
  → setCount(...)
  → Solid reactive update
  → replaceText(textNodeId, "Count: 1")
  → UILabel updates
```

## Properties

Properties fall into three buckets:

1. serializable native properties (`style`, `accessibilityLabel`, `disabled`, etc.),
2. events (`onPress`, later `onChangeText`, gestures),
3. framework-only properties that native never sees.

Unknown native properties should produce a development warning rather than being silently ignored.

## Styling v0.1

The first proof only needs a small subset: direction, gap, padding, width/height where practical, background color, foreground/text color, and font size. The public style object is intentionally smaller than CSS. We will expand it from real application requirements rather than attempting CSS compatibility.

## Testing

`@stingjs/core` uses a recording bridge in unit tests. Renderer tests assert ordered native mutations and event round trips. Native runtimes have platform tests for node creation, child insertion, text recomputation, and event emission.
