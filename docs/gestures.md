# Gestures

Train B gesture support uses native recognizers/touch handling and sends only plain values through Sting's existing node-event channel.

The initial gesture surface is intentionally small:

- tap
- long press
- pan start
- pan move
- pan end / cancellation

Gesture state remains native while a gesture is in progress. JavaScript receives normalized event payloads rather than UIKit recognizers, Android `MotionEvent` objects, pointers, or engine-owned handles.

## Point payload

Tap and long-press events report:

```ts
{
  x: number;
  y: number;
  touches: number;
}
```

Coordinates are local to the gesture container.

## Pan payload

Pan events report:

```ts
{
  x: number;
  y: number;
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
  touches: number;
  cancelled: boolean;
}
```

Translation starts at the beginning of the current pan. Velocity is expressed in points/dp per second using the native platform's gesture/touch facilities.

## Ownership

Gestures report intent; they do not create a second application state system. Solid signals remain authoritative for UI state and navigation state.

This is especially important for navigation: the upcoming interactive-back work can use native pan recognition to request a back transition, while `NavigationStack` continues to let Solid own the actual route stack.

## Scope

This foundation does not yet define gesture composition/priority DSLs, pinch/rotation, arbitrary pointer streams, or React Native-style responder negotiation. Those can be added only where a real Sting application requires them without exposing platform gesture objects to JavaScript.
