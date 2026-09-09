import { Button, Heading, Stack, Text } from '@stingjs/native';
import { createSignal } from 'solid-js';

export default function App() {
  const [count, setCount] = createSignal(0);

  return (
    <Stack p="6" gap="3" bg="surface">
      <Heading level={2}>Welcome to Sting</Heading>
      <Text>Count: {count()}</Text>
      <Button variant="primary" onPress={() => setCount((value) => value + 1)}>
        Add
      </Button>
    </Stack>
  );
}
