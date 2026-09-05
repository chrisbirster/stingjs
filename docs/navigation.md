# Navigation

Sting navigation starts with a small native stack primitive rather than a second router state machine.

```tsx
import { NavigationStack, SafeArea, Stack, Text } from '@stingjs/native';
import { For, createSignal } from 'solid-js';

const [screens, setScreens] = createSignal(['home']);

<NavigationStack
  onBack={() => setScreens(current => current.length > 1 ? current.slice(0, -1) : current)}
>
  <For each={screens()}>{screen =>
    <SafeArea>
      <Stack p="4">
        <Text>{screen}</Text>
      </Stack>
    </SafeArea>
  }</For>
</NavigationStack>
```

## Contract

`NavigationStack` children are ordered from oldest to newest. The final child is the active screen.

- Native keeps previous screens mounted and hides them.
- The active screen fills the native stack viewport by default.
- A native back action emits `onBack` only when the stack has more than one screen.
- `onBack` is a request, not an imperative native pop. Application/Solid state removes the top screen.
- Because Solid owns the children, Sting does not maintain a second route stack that can drift out of sync.

## Platform back routing

Native hosts can call the runtime `requestBack()` operation.

On Android, the host should try Sting first and fall back to the platform when Sting returns `false`:

```kotlin
override fun onBackPressed() {
    if (runtime.requestBack()) return
    super.onBackPressed()
}
```

Sting routes a back request to the deepest active `NavigationStack` first. A navigation stack inside a retained but hidden screen is ignored. If a nested active stack is already at its root, the request bubbles to the nearest active ancestor stack.

iOS uses the same shared native routing contract. Native back controls and the gesture layer can call `requestBack()`; gesture-driven interactive transitions are intentionally a later Train B slice.

## Composition

System UI and keyboard overlap stay separate from navigation:

```tsx
<NavigationStack onBack={pop}>
  <SafeArea>
    <KeyboardAvoidingView>
      {screen}
    </KeyboardAvoidingView>
  </SafeArea>
</NavigationStack>
```

`SafeArea` owns system bars and display cutouts. `KeyboardAvoidingView` owns keyboard/IME overlap. `NavigationStack` owns screen visibility and back-request routing.

## Not a router yet

This foundation deliberately does not define route names, URL parsing, deep-link matching, tab navigation, or a web-router compatibility layer. Those features can build on the native stack without changing the core ownership rule: Solid state is authoritative, and native surfaces platform navigation behavior through events rather than owning application route objects.
