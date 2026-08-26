import { Text } from '@stingjs/native';
import { createMemo } from 'solid-js';

interface PromiseContentProps {
  readonly prefix: string;
  readonly generation: () => number;
  readonly request: () => Promise<string>;
}

export function PromiseContent(props: PromiseContentProps) {
  const value = createMemo<string>(() => {
    props.generation();
    return props.request();
  });
  return <Text>{props.prefix}:{value()}</Text>;
}

interface StreamContentProps {
  readonly prefix: string;
  readonly generation: () => number;
  readonly stream: () => AsyncIterable<string>;
}

export function StreamContent(props: StreamContentProps) {
  const value = createMemo<string>(() => {
    props.generation();
    return props.stream();
  });
  return <Text>{props.prefix}:{value()}</Text>;
}
