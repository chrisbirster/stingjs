# Safe area and edge-to-edge layout

Sting application roots are full-bleed. Content that must avoid system UI should opt into the native `SafeArea` primitive from `@stingjs/native`.

```tsx
import { SafeArea, Stack, Text } from '@stingjs/native';

export function App() {
  return (
    <SafeArea p="4">
      <Stack gap="3">
        <Text>Hello from Sting</Text>
      </Stack>
    </SafeArea>
  );
}
```

`SafeArea` is a real native container:

- iOS uses UIKit safe-area insets.
- Android uses system-bar and display-cutout insets.
- Sting Style IR padding is additive with the current system insets.
- Insets update natively when the platform changes them; Solid does not need to rebuild the component tree.

This first contract covers system safe-area insets. Keyboard/IME insets are intentionally separate and are tracked as the next application-framework slice in #103.
