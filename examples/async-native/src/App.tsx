import { createMemo, createSignal, Errored, flush, isPending, Loading } from 'solid-js';
import { Button, Text, View } from '@stingjs/native';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

interface StingAsyncNativeControls {
  resolve(value: string): void;
  beginRefresh(): void;
  reject(message: string): void;
  streamYield(value: string): void;
}

declare global {
  var __stingAsyncNative: StingAsyncNativeControls | undefined;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

class ControlledStringStream implements AsyncIterable<string> {
  private readonly queuedValues: string[] = [];
  private readonly waiters: Array<(value: string) => void> = [];

  push(value: string): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(value);
      return;
    }

    this.queuedValues.push(value);
  }

  private nextValue(): Promise<string> {
    const queuedValue = this.queuedValues.shift();
    if (queuedValue !== undefined) {
      return Promise.resolve(queuedValue);
    }

    return new Promise<string>(resolve => {
      this.waiters.push(resolve);
    });
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      yield await this.nextValue();
    }
  }
}

let activeRequest = deferred<string>();
const controlledStream = new ControlledStringStream();

interface AsyncContentProps {
  generation: () => number;
}

function AsyncContent(props: AsyncContentProps) {
  // Keep the async computation INSIDE <Errored>'s owned subtree. If this memo
  // rejects, resetting the boundary can dispose/recreate it against the fresh
  // request prepared by the retry transaction. A memo created in App itself
  // would outlive the boundary and immediately rethrow the same settled error.
  const value = createMemo(() => {
    props.generation();
    return activeRequest.promise;
  });

  return (
    <Loading fallback={<Text accessibilityLabel="async-loading">Loading...</Text>}>
      <View accessibilityLabel="async-ready-state">
        <Text accessibilityLabel="async-value">Value: {value()}</Text>
        <Text accessibilityLabel="async-pending">
          Pending: {isPending(() => value()) ? 'yes' : 'no'}
        </Text>
      </View>
    </Loading>
  );
}

function StreamContent() {
  // Solid 2 treats an AsyncIterable as a first-class async memo result. Before
  // the first yield the Loading fallback is visible. Every later yield becomes
  // the memo's new value, which should let Sting mutate one existing native
  // text node rather than rebuilding the native subtree.
  const value = createMemo<string>(() => controlledStream);

  return (
    <View accessibilityLabel="stream-state">
      <Text accessibilityLabel="stream-title">Solid 2 async iterable proof</Text>
      <Loading fallback={<Text accessibilityLabel="stream-loading">Stream loading...</Text>}>
        <Text accessibilityLabel="stream-value">Stream: {value()}</Text>
      </Loading>
    </View>
  );
}

export default function App() {
  const [requestGeneration, setRequestGeneration] = createSignal(0);
  let retryErrored: (() => void) | undefined;

  function prepareRequest(): void {
    activeRequest = deferred<string>();
    setRequestGeneration(generation => generation + 1);
  }

  globalThis.__stingAsyncNative = {
    resolve(nextValue) {
      activeRequest.resolve(nextValue);
    },

    beginRefresh() {
      prepareRequest();

      // This global is a deterministic XCTest control rather than a native
      // event, so explicitly settle Solid 2's automatically batched update.
      // Native events do not need this: renderApp() flushes once after the
      // complete event handler returns.
      flush();
    },

    reject(message) {
      activeRequest.reject(new Error(message));
    },

    streamYield(value) {
      controlledStream.push(value);
    },
  };

  return (
    <View style={{ flexDirection: 'column', gap: 8, padding: 24 }}>
      <Text accessibilityLabel="async-title">Solid 2 async native proof</Text>

      <Errored
        fallback={(error, reset) => {
          retryErrored = () => {
            prepareRequest();
            reset();
          };

          return (
            <View accessibilityLabel="async-error-state">
              <Text accessibilityLabel="async-error">Error: {String(error())}</Text>
              <Button
                accessibilityLabel="async-retry"
                onPress={() => retryErrored?.()}
              >
                Retry
              </Button>
            </View>
          );
        }}
      >
        <AsyncContent generation={requestGeneration} />
      </Errored>

      <StreamContent />
    </View>
  );
}
