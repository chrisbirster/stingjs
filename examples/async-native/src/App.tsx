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
  retry(): void;
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

let activeRequest = deferred<string>();

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

    retry() {
      // Exercise the same transaction as the native Retry button below. The
      // replacement Promise and Errored reset are prepared before one flush so
      // the newly-created AsyncContent memo sees the fresh request immediately.
      retryErrored?.();
      flush();
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
    </View>
  );
}
