import { flush } from 'solid-js';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

export function deferred<T>(): Deferred<T> {
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

type StreamWaiter<T> = {
  resolve(result: IteratorResult<T>): void;
  reject(error: unknown): void;
};

export class ControlledAsyncIterable<T> implements AsyncIterable<T> {
  private readonly queued: IteratorResult<T>[] = [];
  private readonly waiters: StreamWaiter<T>[] = [];
  private terminalError: unknown;
  private completed = false;

  push(value: T): void {
    if (this.completed || this.terminalError !== undefined) {
      throw new Error('Cannot push to a completed controlled stream');
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }

    this.queued.push({ value, done: false });
  }

  complete(): void {
    if (this.completed || this.terminalError !== undefined) return;
    this.completed = true;

    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined as T, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.completed || this.terminalError !== undefined) return;
    this.terminalError = error;

    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const queued = this.queued.shift();
        if (queued) return Promise.resolve(queued);
        if (this.terminalError !== undefined) return Promise.reject(this.terminalError);
        if (this.completed) return Promise.resolve({ value: undefined as T, done: true });

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}

/**
 * Promise settlement is deliberately driven by the caller. No timers, network,
 * or host scheduling are involved. Multiple turns make the helper resilient to
 * the nested Promise continuations used by Solid's async graph on every engine.
 */
export async function settleSolid(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
    flush();
  }
}

export interface SampleStats {
  min: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

export function sampleStats(samples: readonly number[]): SampleStats {
  if (samples.length === 0) {
    return { min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);

  return {
    min: sorted[0] ?? 0,
    mean: total / samples.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}
