import { createSignal } from 'solid-js';
import * as stylex from '@stingjs/stylex';
import { Clipboard } from '@stingjs/clipboard';
import { Haptics } from '@stingjs/haptics';
import { Button, Heading, Stack, Text, nativeBlur } from '@stingjs/native';

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
      <Heading level={2}>Count: {count()}</Heading>
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
