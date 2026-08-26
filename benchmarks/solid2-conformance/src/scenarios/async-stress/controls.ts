import { flush } from 'solid-js';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

type StreamStep<T> =
  | { kind: 'value'; value: T }
  | { kind: 'done' }
  | { kind: 'error'; error: Error };

export class ControlledAsyncIterator<T> implements AsyncIterable<T>, AsyncIterator<T> {
  private readonly queued: StreamStep<T>[] = [];
  private readonly waiters: Array<{
    resolve(result: IteratorResult<T>): void;
    reject(error: Error): void;
  }> = [];
  private closed = false;

  nextCalls = 0;
  returnCalls = 0;

  push(value: T): void {
    if (this.closed) return;
    this.deliver({ kind: 'value', value });
  }

  complete(): void {
    if (this.closed) return;
    this.closed = true;
    this.deliver({ kind: 'done' });
  }

  fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.deliver({ kind: 'error', error });
  }

  next(): Promise<IteratorResult<T>> {
    this.nextCalls += 1;
    const step = this.queued.shift();
    if (step) return this.resultFor(step);

    if (this.closed) {
      return Promise.resolve({ value: undefined as T, done: true });
    }

    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.returnCalls += 1;
    if (!this.closed) {
      this.closed = true;
      while (this.waiters.length > 0) {
        this.waiters.shift()?.resolve({ value: undefined as T, done: true });
      }
    }
    return Promise.resolve({ value: undefined as T, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }

  private deliver(step: StreamStep<T>): void {
    const waiter = this.waiters.shift();
    if (!waiter) {
      this.queued.push(step);
      return;
    }

    if (step.kind === 'error') {
      waiter.reject(step.error);
      return;
    }

    if (step.kind === 'done') {
      waiter.resolve({ value: undefined as T, done: true });
      return;
    }

    waiter.resolve({ value: step.value, done: false });
  }

  private resultFor(step: StreamStep<T>): Promise<IteratorResult<T>> {
    if (step.kind === 'error') return Promise.reject(step.error);
    if (step.kind === 'done') {
      return Promise.resolve({ value: undefined as T, done: true });
    }
    return Promise.resolve({ value: step.value, done: false });
  }
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

export async function drainAsync(turns = 6): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    flush();
  }
}
