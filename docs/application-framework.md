# Sting application framework contract

Train B defines the native application primitives Sting needs above the renderer and Modules SDK. These APIs use the real SolidJS 2 runtime and `@solidjs/universal`; Solid remains authoritative for application state and native hosts remain ordinary UIKit / Android Views.

## Root and layout

`AppRoot` is a full-bleed application container. It does **not** silently apply system or keyboard insets.

```tsx
import {
  AppRoot,
  KeyboardAvoidingView,
  SafeArea,
  Stack,
  Text,
} from '@stingjs/native';

export function App() {
  return (
    <AppRoot onAppStateChange={({ state }) => console.log(state)}>
      <SafeArea p="4">
        <KeyboardAvoidingView>
          <Stack gap="3">
            <Text>Hello from Sting</Text>
          </Stack>
        </KeyboardAvoidingView>
      </SafeArea>
    </AppRoot>
  );
}
```

The layout contract is intentionally explicit:

- the native host root is full-bleed;
- `SafeArea` owns system bars, notches, and display cutouts;
- `KeyboardAvoidingView` owns keyboard / IME overlap only;
- authored padding is additive with those platform insets;
- `Stack`, `HStack`, `GestureView`, `FocusView`, `AppRoot`, and list sizing use the existing Sting Style IR;
- system inset and lifecycle changes do not require rebuilding the Solid tree.

`AppRoot` can report `onAppear`, `onDisappear`, and `onAppStateChange`. App state is normalized to `active`, `inactive`, or `background` and contains no UIKit or Android application objects.

## Navigation

`NavigationStack` is declarative. Children are ordered oldest-to-newest and only the final screen is visible. Previous screens stay mounted to preserve Solid/native identity.

A platform back request invokes `onBack`; the application changes the Solid state that determines which screen exists. Native code never owns a second route stack. Nested active stacks receive back first, hidden retained stacks are ignored, and back bubbles to an active ancestor when a nested stack is already at its root.

See `docs/navigation.md` for the complete navigation contract.

## Gestures

`GestureView` uses UIKit gesture recognizers and Android native touch/gesture APIs. It supports:

- `onTap`
- `onLongPress`
- `onPanStart`
- `onPan`
- `onPanEnd`

Payloads contain normalized numeric/boolean values such as coordinates, translation, velocity, touch count, and cancellation state. Platform gesture recognizer or MotionEvent objects never cross into the public API.

Gesture observation is non-owning: nested native controls continue receiving their normal touch stream.

See `docs/gestures.md` for payload details.

## Modal and sheet presentation

`Modal` and `Sheet` are real native presentations controlled by the `presented` prop.

```tsx
<Sheet presented={showSettings()} onDismiss={() => setShowSettings(false)}>
  <SafeArea p="4">
    <Settings />
  </SafeArea>
</Sheet>
```

On iOS, sheets use UIKit page-sheet presentation and modals use full-screen overlay presentation. On Android, the presentation host uses a native Dialog, with sheets anchored to the bottom.

Presented child views keep their native identity across dismiss/re-present cycles. User-driven dismissal emits `onDismiss`; the application remains responsible for updating `presented` so declarative state stays authoritative.

Style the presented content through children such as `SafeArea`, `Stack`, and `View`; the presentation host itself is an ownership/presentation primitive rather than a competing layout surface.

## Virtualized lists

`VirtualList` is Sting 1.0's native-windowed list contract.

```tsx
<VirtualList itemExtent={56} overscan={3} height={420}>
  <For each={items()}>{item => <Row item={item} />}</For>
</VirtualList>
```

The 1.0 contract is deliberately constrained:

- vertical lists;
- a required fixed `itemExtent`;
- configurable `overscan`;
- Solid owns item identity and ordering;
- native keeps the item views indexed but attaches only the visible window plus overscan to the active UIKit / Android view hierarchy.

This avoids a second reconciler while removing off-screen items from native layout/draw work. Variable-height recycling and horizontal virtualization are future extensions rather than hidden heuristics in the 1.0 contract.

## Accessibility and focus

All core native primitives support portable accessibility metadata:

- `accessibilityLabel`
- `accessibilityHint`
- `accessibilityValue`
- `accessibilityRole`
- `accessibilityHidden`
- `focusable`

Supported roles are `none`, `text`, `header`, `button`, `image`, and `link`. Sting maps these to UIKit accessibility traits and Android accessibility node semantics rather than exposing platform accessibility objects.

`FocusView` adds explicit focus ownership:

```tsx
<FocusView
  accessibilityLabel="Search"
  accessibilityRole="button"
  autoFocus
  onFocus={() => setFocused(true)}
  onBlur={() => setFocused(false)}
>
  <SearchControl />
</FocusView>
```

On iOS this is a first-responder-capable native view; on Android it is a focusable native ViewGroup. Focus and blur use the existing Sting node event channel.

## Ownership and teardown

Application-framework hosts participate in the renderer's ordinary ownership lifecycle. Registry teardown explicitly:

- unregisters lifecycle observers;
- dismisses presentation hosts;
- removes gesture and focus handlers;
- clears navigation back handlers;
- releases virtual-list attachment caches;
- clears accessibility bridge metadata;
- then performs the existing native-module view/object teardown.

The JavaScript runtime disposer still runs first so Solid can issue ordinary `removeNode` operations while the renderer is live.

## Styling boundary

Train B does not introduce a new layout or style language. The modifier-first / semantic prop / `sx` inputs continue to resolve into Sting's existing Style IR and native modifier channel. Native application primitives add platform behavior around that same host tree; they do not create DOM semantics, React-style reconciliation, or engine-owned application values.
