import { createSignal } from 'solid-js';
import { Clipboard } from '@stingjs/clipboard';
import { Haptics } from '@stingjs/haptics';
import { Button, Text, View } from '@stingjs/native';

export default function App() {
  const [count, setCount] = createSignal(0);
  const [clipboardStatus, setClipboardStatus] = createSignal('Clipboard ready');

  return (
    <View style={{ flexDirection: 'column', gap: 12, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Count: {count()}</Text>
      <Button
        onPress={() => {
          Clipboard.setString(`Count: ${count()}`);
          setClipboardStatus(`Copied Count: ${count()}`);
        }}
      >
        Copy count
      </Button>
      <Text>{clipboardStatus()}</Text>
      <Button
        onPress={() => {
          setCount(count() + 1);
          Haptics.impact('medium');
        }}
      >
        Add
      </Button>
    </View>
  );
}
