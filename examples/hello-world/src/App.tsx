import { createSignal } from 'solid-js';
import { Haptics } from '@stingjs/haptics';
import { Button, Text, View } from '@stingjs/native';

export default function App() {
  const [count, setCount] = createSignal(0);

  return (
    <View style={{ flexDirection: 'column', gap: 12, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Count: {count()}</Text>
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
