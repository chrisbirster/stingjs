import { createMemo, createSignal, Errored, flush, isPending, Loading } from 'solid-js';
import { Text, View } from '@stingjs/native';

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

export default function App() {
  const [requestGeneration, setRequestGeneration] = createSignal(0);
  const [loadingEpoch, setLoadingEpoch] = createSignal(0);
  let resetErrored: (() => void) | undefined;

  const value = createMemo(() => {
    requestGeneration();
    return activeRequest.promise;
  });

  function startRequest(): void {
    activeRequest = deferred<string>();
    setRequestGeneration(generation => generation + 1);

    // Solid 2 batches writes onto a microtask. The controls below are a
    // deterministic test surface, so settle the generation change now. This
    // makes XCTest able to inspect the exact pending state immediately after
    // requesting a refresh/retry without using timers or network I/O.
    flush();
  }

  globalThis.__stingAsyncNative = {
    resolve(nextValue) {
      activeRequest.resolve(nextValue);
    },

    beginRefresh() {
      startRequest();
    },

    reject(message) {
      activeRequest.reject(new Error(message));
    },

    retry() {
      // A normal refresh intentionally demonstrates Solid 2's stale-while-
      // pending behavior. Retry is different: changing Loading's `on` key asks
      // the boundary to re-show its fallback while the replacement request is
      // pending, which is useful after an error or route/key transition.
      setLoadingEpoch(epoch => epoch + 1);
      startRequest();
      resetErrored?.();
      flush();
    },
  };

  return (
    <View style={{ flexDirection: 'column', gap: 8, padding: 24 }}>
      <Text accessibilityLabel="async-title">Solid 2 async native proof</Text>

      <Errored
        fallback={(error, reset) => {
          resetErrored = reset;
          return (
            <View accessibilityLabel="async-error-state">
              <Text accessibilityLabel="async-error">Error: {String(error())}</Text>
            </View>
          );
        }}
      >
        <Loading
          on={loadingEpoch()}
          fallback={<Text accessibilityLabel="async-loading">Loading...</Text>}
        >
          <View accessibilityLabel="async-ready-state">
            <Text accessibilityLabel="async-value">Value: {value()}</Text>
            <Text accessibilityLabel="async-pending">
              Pending: {isPending(() => value()) ? 'yes' : 'no'}
            </Text>
          </View>
        </Loading>
      </Errored>
    </View>
  );
}
