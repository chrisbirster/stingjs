import {
  action,
  createMemo,
  createOptimistic,
  createOptimisticStore,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  refresh,
} from 'solid-js';
import { StingHost, type HostNode, type StingNativeBridge } from '@stingjs/core';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';

const ACTION_BENCHMARK_SAMPLES = 24;
const ASYNC_SETTLE_TURNS = 4;

export const actionScenarioControls = Object.freeze({
  actionBenchmarkSamples: ACTION_BENCHMARK_SAMPLES,
  asyncSettleTurns: ASYNC_SETTLE_TURNS,
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

type Todo = { id: number; text: string; pending: boolean };
type NativeOperation =
  | { kind: 'createElement'; id: number; type: string }
  | { kind: 'createTextNode'; id: number; value: string }
  | { kind: 'replaceText'; id: number; value: string }
  | { kind: 'setProperty'; id: number; name: string; valueJSON: string }
  | { kind: 'insertNode'; parentId: number; nodeId: number; anchorId: number }
  | { kind: 'removeNode'; parentId: number; nodeId: number }
  | { kind: 'setEventEnabled'; id: number; event: string; enabled: boolean };

class RecordingNativeBridge implements StingNativeBridge {
  readonly operations: NativeOperation[] = [];
  getRuntimeInfo(): string {
    return JSON.stringify({ protocolVersion: 1, platform: 'ios', modules: {} });
  }
  createElement(id: number, type: string): void {
    this.operations.push({ kind: 'createElement', id, type });
  }
  createTextNode(id: number, value: string): void {
    this.operations.push({ kind: 'createTextNode', id, value });
  }
  replaceText(id: number, value: string): void {
    this.operations.push({ kind: 'replaceText', id, value });
  }
  setProperty(id: number, name: string, valueJSON: string): void {
    this.operations.push({ kind: 'setProperty', id, name, valueJSON });
  }
  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
  }
  removeNode(parentId: number, nodeId: number): void {
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
  }
  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
  }
  callModuleSync(): string {
    return JSON.stringify({ ok: true });
  }
  clear(): void {
    this.operations.length = 0;
  }
  count(kind: NativeOperation['kind']): number {
    return this.operations.filter(operation => operation.kind === kind).length;
  }
  replacements(): Extract<NativeOperation, { kind: 'replaceText' }>[] {
    return this.operations.filter(
      (operation): operation is Extract<NativeOperation, { kind: 'replaceText' }> =>
        operation.kind === 'replaceText',
    );
  }
  unrelatedMutationCount(): number {
    return this.operations.filter(operation => operation.kind !== 'replaceText').length;
  }
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function rejectedError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

async function settleMicrotasks(): Promise<void> {
  for (let turn = 0; turn < ASYNC_SETTLE_TURNS; turn += 1) await Promise.resolve();
  flush();
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function recordDistribution(context: ScenarioContext, prefix: string, samples: readonly number[]): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  context.metric(`${prefix}.samples`, samples.length, 'count');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, 'ms');
  context.metric(`${prefix}.mean`, samples.length ? total / samples.length : 0, 'ms');
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), 'ms');
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), 'ms');
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), 'ms');
  context.metric(`${prefix}.max`, sorted.at(-1) ?? 0, 'ms');
}

function assertSingleTextMutation(
  context: ScenarioContext,
  label: string,
  bridge: RecordingNativeBridge,
  node: HostNode,
  value: string,
): void {
  const replacements = bridge.replacements();
  context.assert(`${label}: exactly one replaceText`, replacements.length === 1, `count=${replacements.length}`);
  context.assert(`${label}: correct native identity`, replacements[0]?.id === node.id);
  context.assert(`${label}: correct native value`, replacements[0]?.value === value);
  context.assert(`${label}: no unrelated native replay`, bridge.unrelatedMutationCount() === 0);
}

async function runActionBasics(context: ScenarioContext): Promise<void> {
  const successGate = deferred<number>();
  const succeed = action(function* (input: number) {
    return input + ((yield successGate.promise) as number);
  });
  const success = succeed(7);
  successGate.resolve(5);
  context.assert('action success resolves returned value', (await success) === 12);

  const failureGate = deferred<void>();
  const expected = new Error('deterministic action failure');
  const fail = action(function* () {
    yield failureGate.promise;
  });
  const failed = fail();
  failureGate.reject(expected);
  context.assert('action failure propagates exact error', (await rejectedError(failed)) === expected);
}

async function runConcurrentAndOptimisticSignals(context: ScenarioContext): Promise<void> {
  const leftGate = deferred<void>();
  const rightGate = deferred<void>();
  const [left, setLeft] = createOptimistic(0);
  const [right, setRight] = createOptimistic(0);
  const leftAction = action(function* () {
    setLeft(1);
    yield leftGate.promise;
  });
  const rightAction = action(function* () {
    setRight(10);
    yield rightGate.promise;
  });
  const leftPending = leftAction();
  const rightPending = rightAction();
  flush();
  context.assert('multiple concurrent actions expose both optimistic values', left() === 1 && right() === 10);
  rightGate.resolve(undefined);
  await rightPending;
  flush();
  context.assert('one concurrent action can settle while the other remains pending', left() === 1 && right() === 0);
  leftGate.resolve(undefined);
  await leftPending;
  flush();
  context.assert('concurrent optimistic values revert after both actions settle', left() === 0 && right() === 0);

  const scalarGate = deferred<void>();
  const [scalar, setScalar] = createOptimistic(4);
  const mutateScalar = action(function* () {
    setScalar(9);
    yield scalarGate.promise;
  });
  const scalarPending = mutateScalar();
  flush();
  context.assert('optimistic scalar applies while pending', scalar() === 9);
  scalarGate.resolve(undefined);
  await scalarPending;
  flush();
  context.assert('optimistic scalar rolls back on successful settlement without correction', scalar() === 4);

  const objectGate = deferred<void>();
  const [profile, setProfile] = createOptimistic({ name: 'Ada', score: 1 });
  const mutateObject = action(function* () {
    setProfile(current => ({ ...current, name: 'Grace', score: current.score + 6 }));
    yield objectGate.promise;
  });
  const objectPending = mutateObject();
  flush();
  context.assert('optimistic object state applies atomically', profile().name === 'Grace' && profile().score === 7);
  objectGate.resolve(undefined);
  await objectPending;
  flush();
  context.assert('optimistic object state rolls back atomically', profile().name === 'Ada' && profile().score === 1);
}

async function runOptimisticStores(context: ScenarioContext): Promise<void> {
  const objectGate = deferred<void>();
  const [state, setState] = createOptimisticStore({ user: { name: 'Ada', score: 1 }, saving: false });
  const mutateObject = action(function* () {
    setState(draft => {
      draft.user.name = 'Grace';
      draft.user.score = 7;
      draft.saving = true;
    });
    yield objectGate.promise;
  });
  const objectPending = mutateObject();
  flush();
  context.assert('createOptimisticStore applies nested object mutation', state.user.name === 'Grace' && state.saving);
  objectGate.resolve(undefined);
  await objectPending;
  flush();
  context.assert('createOptimisticStore rolls nested object mutation back', state.user.name === 'Ada' && !state.saving);

  const arrayGate = deferred<void>();
  const [todos, setTodos] = createOptimisticStore<Todo[]>([{ id: 1, text: 'baseline', pending: false }]);
  const append = action(function* () {
    setTodos(draft => void draft.push({ id: -1, text: 'optimistic', pending: true }));
    yield arrayGate.promise;
  });
  const arrayPending = append();
  flush();
  context.assert('optimistic array mutation appends temporary row', todos.length === 2 && todos[1]?.id === -1);
  arrayGate.resolve(undefined);
  await arrayPending;
  flush();
  context.assert('optimistic array rollback removes ghost row', todos.length === 1 && todos[0]?.id === 1);

  const firstGate = deferred<void>();
  const secondGate = deferred<void>();
  const overlap = action(function* (item: Todo, gate: Deferred<void>) {
    setTodos(draft => void draft.push(item));
    yield gate.promise;
  });
  const first = overlap({ id: -1, text: 'first', pending: true }, firstGate);
  const second = overlap({ id: -2, text: 'second', pending: true }, secondGate);
  flush();
  context.assert(
    'overlapping optimistic mutations compose',
    todos.some(todo => todo.id === -1) && todos.some(todo => todo.id === -2),
  );
  secondGate.resolve(undefined);
  await second;
  flush();
  context.assert('settling one overlap preserves the other', todos.some(todo => todo.id === -1) && !todos.some(todo => todo.id === -2));
  firstGate.resolve(undefined);
  await first;
  flush();
  context.assert('overlapping optimistic mutations fully clean up', todos.length === 1 && todos[0]?.id === 1);
}

async function runAsyncMemoAndRefresh(context: ScenarioContext): Promise<void> {
  const memoFixture = createRoot(dispose => {
    let authoritative = 1;
    const [revision, setRevision] = createSignal(0);
    const value = createMemo(async () => {
      revision();
      return authoritative;
    });
    const gate = deferred<number>();
    const update = action(function* () {
      authoritative = (yield gate.promise) as number;
      setRevision(current => current + 1);
    });
    return { dispose, value, gate, update };
  });
  await settleMicrotasks();
  context.assert('async memo is settled before action interaction', memoFixture.value() === 1);
  const memoPending = memoFixture.update();
  memoFixture.gate.resolve(7);
  await memoPending;
  await settleMicrotasks();
  context.assert('action source write recomputes async memo', memoFixture.value() === 7);
  memoFixture.dispose();

  const refreshFixture = createRoot(dispose => {
    let server: Todo[] = [{ id: 1, text: 'baseline', pending: false }];
    const [todos, setTodos] = createOptimisticStore<Todo[]>(() => server.map(todo => ({ ...todo })), []);
    const gate = deferred<Todo>();
    const save = action(function* () {
      setTodos(draft => void draft.push({ id: -1, text: 'draft', pending: true }));
      const saved = (yield gate.promise) as Todo;
      server = [...server, saved];
      refresh(todos);
      return saved;
    });
    flush();
    return { dispose, todos, gate, save };
  });
  const refreshPending = refreshFixture.save();
  flush();
  context.assert('action + refresh exposes optimistic derived-store row', refreshFixture.todos.some(todo => todo.id === -1));
  refreshFixture.gate.resolve({ id: 2, text: 'server corrected', pending: false });
  const saved = await refreshPending;
  await settleMicrotasks();
  context.assert('action-triggered refresh returns server result', saved.id === 2);
  context.assert(
    'action-triggered refresh reconciles optimistic row',
    refreshFixture.todos.length === 2 && refreshFixture.todos[1]?.id === 2 && !refreshFixture.todos.some(todo => todo.id === -1),
  );
  refreshFixture.dispose();
}

type NativeFixture = {
  dispose(): void;
  bridge: RecordingNativeBridge;
  host: StingHost;
  container: HostNode;
  text: HostNode;
  button: HostNode;
  gate: Deferred<number>;
  pending(): Promise<number> | undefined;
  value(): number;
};

function createNativeFixture(rollback: boolean): NativeFixture {
  return createRoot(dispose => {
    const bridge = new RecordingNativeBridge();
    const host = new StingHost(bridge);
    const container = host.createElement('view');
    host.insertNode(host.root, container);
    const [authoritative, setAuthoritative] = createSignal(10);
    const [value, setValue] = rollback ? createOptimistic(10) : createOptimistic(() => authoritative());
    const text = host.createTextNode(`Value: ${value()}`);
    host.insertNode(container, text);
    const gate = deferred<number>();
    let active: Promise<number> | undefined;
    createRenderEffect(() => `Value: ${value()}`, next => host.replaceText(text, next));
    const save = action(function* () {
      setValue(15);
      const serverValue = (yield gate.promise) as number;
      if (!rollback) setAuthoritative(serverValue);
      return serverValue;
    });
    const button = host.createElement('button');
    host.setProperty(button, 'accessibilityLabel', rollback ? 'action-rollback' : 'action-correction');
    host.setProperty(button, 'onPress', () => {
      active = save();
    });
    host.insertNode(container, button);
    flush();
    bridge.clear();
    return { dispose, bridge, host, container, text, button, gate, pending: () => active, value };
  });
}

async function runNativeMutationConformance(context: ScenarioContext): Promise<void> {
  const correction = createNativeFixture(false);
  const correctionText = correction.text;
  const correctionButton = correction.button;
  correction.host.dispatchEvent(correction.button.id, 'press');
  flush();
  assertSingleTextMutation(context, 'optimistic apply', correction.bridge, correction.text, 'Value: 15');
  context.assert('native button/event path starts action', correction.pending() !== undefined);
  context.metric('actions.native.optimistic-apply.mutations', correction.bridge.count('replaceText'), 'count');
  correction.bridge.clear();
  correction.gate.resolve(14);
  const corrected = correction.pending();
  if (corrected) context.assert('correction action returns authoritative value', (await corrected) === 14);
  flush();
  assertSingleTextMutation(context, 'optimistic correction', correction.bridge, correction.text, 'Value: 14');
  context.assert('correction preserves native text/button identity', correction.text === correctionText && correction.button === correctionButton);
  context.assert(
    'correction leaves no ghost nodes',
    correction.container.children.length === 2 && correction.container.children[0] === correctionText && correction.container.children[1] === correctionButton,
  );
  context.metric('actions.native.optimistic-correction.mutations', correction.bridge.count('replaceText'), 'count');
  correction.dispose();

  const rollback = createNativeFixture(true);
  const rollbackText = rollback.text;
  const rollbackButton = rollback.button;
  rollback.host.dispatchEvent(rollback.button.id, 'press');
  flush();
  assertSingleTextMutation(context, 'rollback optimistic apply', rollback.bridge, rollback.text, 'Value: 15');
  rollback.bridge.clear();
  const expected = new Error('rollback requested');
  rollback.gate.reject(expected);
  const rollbackPending = rollback.pending();
  context.assert('action error propagates through native event-started action', rollbackPending ? (await rejectedError(rollbackPending)) === expected : false);
  flush();
  assertSingleTextMutation(context, 'optimistic rollback', rollback.bridge, rollback.text, 'Value: 10');
  context.assert('rollback restores accessor value', rollback.value() === 10);
  context.assert('rollback preserves native identity', rollback.text === rollbackText && rollback.button === rollbackButton);
  context.assert(
    'rollback leaves no ghost nodes',
    rollback.container.children.length === 2 && rollback.container.children[0] === rollbackText && rollback.container.children[1] === rollbackButton,
  );
  context.metric('actions.native.rollback.mutations', rollback.bridge.count('replaceText'), 'count');
  rollback.dispose();
}

async function runDisposalWhilePending(context: ScenarioContext): Promise<void> {
  const gate = deferred<void>();
  let disposeRoot: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  let bridge: RecordingNativeBridge | undefined;
  createRoot(dispose => {
    disposeRoot = dispose;
    bridge = new RecordingNativeBridge();
    const host = new StingHost(bridge);
    const [value, setValue] = createOptimistic(0);
    const text = host.createTextNode(String(value()));
    createRenderEffect(() => String(value()), next => host.replaceText(text, next));
    const mutate = action(function* () {
      setValue(1);
      yield gate.promise;
    });
    pending = mutate();
    flush();
  });
  context.assert('pending action applies before disposal', bridge?.count('replaceText') === 1);
  bridge?.clear();
  disposeRoot?.();
  gate.resolve(undefined);
  if (pending) await pending;
  flush();
  context.assert('disposed owner receives no stale rollback callback', bridge?.count('replaceText') === 0);
  context.assert('disposed owner receives no unrelated native replay', bridge?.unrelatedMutationCount() === 0);
}

async function runBenchmark(context: ScenarioContext): Promise<void> {
  const fixture = createRoot(dispose => {
    const bridge = new RecordingNativeBridge();
    const host = new StingHost(bridge);
    const [value, setValue] = createOptimistic(0);
    const text = host.createTextNode(String(value()));
    createRenderEffect(() => String(value()), next => host.replaceText(text, next));
    const roundTrip = action(function* (next: number) {
      setValue(next);
      yield Promise.resolve(undefined);
    });
    flush();
    bridge.clear();
    return { dispose, bridge, roundTrip };
  });
  const durations: number[] = [];
  const mutationCounts: number[] = [];
  let unrelated = 0;
  for (let sample = 0; sample < ACTION_BENCHMARK_SAMPLES; sample += 1) {
    fixture.bridge.clear();
    const start = context.now();
    const pending = fixture.roundTrip(sample + 1);
    flush();
    await pending;
    flush();
    durations.push(context.now() - start);
    mutationCounts.push(fixture.bridge.count('replaceText'));
    unrelated += fixture.bridge.unrelatedMutationCount();
  }
  context.assert('action benchmark emits exact apply + rollback pair', mutationCounts.every(count => count === 2), `counts=${mutationCounts.join(',')}`);
  context.assert('action benchmark emits no unrelated native replay', unrelated === 0, `unrelated=${unrelated}`);
  recordDistribution(context, 'actions.optimistic-roundtrip', durations);
  context.metric('actions.optimistic-roundtrip.native-mutations-per-sample', 2, 'count');
  fixture.dispose();
}

export const scenario = {
  id: 'actions-and-optimistic-state',
  title: 'Solid 2 actions, optimistic state, correction, rollback, and native mutation invariants',
  workstream: 'actions',
  kind: 'hybrid',
  async run(context) {
    await runActionBasics(context);
    await runConcurrentAndOptimisticSignals(context);
    await runOptimisticStores(context);
    await runAsyncMemoAndRefresh(context);
    await runNativeMutationConformance(context);
    await runDisposalWhilePending(context);
    await runBenchmark(context);
  },
} satisfies ScenarioDefinition;
