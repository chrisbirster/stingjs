import { createSignal } from 'solid-js';
import * as stylex from '@stingjs/stylex';
import { Clipboard } from '@stingjs/clipboard';
import { Haptics } from '@stingjs/haptics';
import { Button, Stack, Text, fontSize, nativeBlur } from '@stingjs/native';

const styles = stylex.create({
  screen: {
    backgroundColor: '#09090b',
    color: '#ffffff',
  },
  status: {
    color: '#a1a1aa',
  },
});

export default function App() {
  const [count, setCount] = createSignal(0);
  const [clipboardStatus, setClipboardStatus] = createSignal('Clipboard ready');

  return (
    <Stack
      p="6"
      gap="3"
      sx={styles.screen}
      modifiers={[nativeBlur()]}
    >
      <Text modifiers={[fontSize(24)]}>Count: {count()}</Text>
      <Button
        variant="primary"
        onPress={() => {
          Clipboard.setString(`Count: ${count()}`);
          setClipboardStatus(`Copied Count: ${count()}`);
        }}
      >
        Copy count
      </Button>
      <Text sx={styles.status}>{clipboardStatus()}</Text>
      <Button
        variant="secondary"
        onPress={() => {
          setCount(count() + 1);
          Haptics.impact('medium');
        }}
      >
        Add
      </Button>
    </Stack>
  );
}
