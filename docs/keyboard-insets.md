# Keyboard and IME insets

Sting keeps keyboard avoidance explicit and local to the part of the native tree that needs it.
Use `KeyboardAvoidingView` from `@stingjs/native` around forms or bottom-aligned controls that must stay above the software keyboard.

```tsx
import { KeyboardAvoidingView, SafeArea, Stack, TextInput } from '@stingjs/native';

export function Form() {
  return (
    <SafeArea>
      <KeyboardAvoidingView p="4">
        <Stack gap="3">
          <TextInput placeholder="Email" />
          <TextInput placeholder="Message" />
        </Stack>
      </KeyboardAvoidingView>
    </SafeArea>
  );
}
```

`KeyboardAvoidingView` is a real native container:

- iOS derives overlap from UIKit's keyboard layout guide.
- Android derives overlap from IME `WindowInsets`, with an API 23+ compatibility path.
- Authored bottom padding is additive with the current keyboard overlap.
- Keyboard changes update native layout directly; Solid does not subscribe to a global keyboard event stream.
- `SafeArea` remains responsible for system bars and display cutouts. `KeyboardAvoidingView` owns only keyboard/IME overlap, so the two primitives compose without double-counting system UI.

This is the keyboard/inset foundation for Train B. Navigation and gesture primitives build on the same explicit native-container model tracked in #103.
