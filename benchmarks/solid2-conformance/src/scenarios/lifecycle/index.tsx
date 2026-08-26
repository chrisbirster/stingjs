import {
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  getOwner,
  onCleanup,
  onSettled,
  useContext,
  type Setter,
} from 'solid-js';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingNativeBridge,
} from '@stingjs/core';
import { Button, Text, View } from '@stingjs/native';
import { createComponent, insert, renderApp } from '@stingjs/solid';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

interface Distribution {
  readonly samples: number;
  readonly min: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

interface MutationCounts {
  createElement: number;
  createTextNode: number;
  replaceText: number;
  setProperty: number;
  insertNode: number;
  removeNode: number;
  eventEnable: number;
  eventDisable: number;
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

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { samples: 0, min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    samples: sorted.length,
    min: sorted[0] ?? 0,
    mean: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function recordDistribution(context: ScenarioContext, prefix: string, values: readonly number[]): void {
  const stats = distribution(values);
  context.metric(`${prefix}.samples`, stats.samples, 'samples');
  context.metric(`${prefix}.min`, stats.min, 'ms');
  context.metric(`${prefix}.mean`, stats.mean, 'ms');
  context.metric(`${prefix}.p50`, stats.p50, 'ms');
  context.metric(`${prefix}.p95`, stats.p95, 'ms');
  context.metric(`${prefix}.p99`, stats.p99, 'ms');
  context.metric(`${prefix}.max`, stats.max, 'ms');
}

function countEntry(log: readonly string[], value: string): number {
  return log.reduce((count, entry) => count + (entry === value ? 1 : 0), 0);
}

function assertOrdered(
  context: ScenarioContext,
  name: string,
  log: readonly string[],
  before: string,
  after: string,
): void {
  const beforeIndex = log.indexOf(before);
  const afterIndex = log.indexOf(after);
  context.assert(
    name,
    beforeIndex >= 0 && afterIndex >= 0 && beforeIndex < afterIndex,
    `expected ${before} before ${after}; observed ${JSON.stringify(log)}`,
  );
}

function findHostNode(root: HostNode, type: string): HostNode | undefined {
  if (root.type === type) return root;
  for (const child of root.children) {
    const match = findHostNode(child, type);
    if (match) return match;
  }
  return undefined;
}

class LifecycleBridgeProbe implements StingNativeBridge {
  readonly counts: MutationCounts = {
    createElement: 0,
    createTextNode: 0,
    replaceText: 0,
    setProperty: 0,
    insertNode: 0,
    removeNode: 0,
    eventEnable: 0,
    eventDisable: 0,
  };

  private readonly aliveNodes = new Set<number>();
  private readonly children = new Map<number, number[]>([[0, []]]);
  private readonly parent = new Map<number, number>();
  private readonly enabledEvents = new Set<string>();

  constructor(private readonly delegate: StingNativeBridge | undefined) {}

  get aliveNodeCount(): number {
    return this.aliveNodes.size;
  }

  get enabledEventCount(): number {
    return this.enabledEvents.size;
  }

  getRuntimeInfo(): string {
    return this.delegate?.getRuntimeInfo() ?? JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: {},
    });
  }

  createElement(id: number, type: string): void {
    this.counts.createElement += 1;
    this.trackNode(id);
    this.delegate?.createElement(id, type);
  }

  createTextNode(id: number, value: string): void {
    this.counts.createTextNode += 1;
    this.trackNode(id);
    this.delegate?.createTextNode(id, value);
  }

  replaceText(id: number, value: string): void {
    this.counts.replaceText += 1;
    this.delegate?.replaceText(id, value);
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    this.counts.setProperty += 1;
    this.delegate?.setProperty(id, name, valueJSON);
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.counts.insertNode += 1;
    this.detachTrackedNode(nodeId);

    const siblings = this.children.get(parentId) ?? [];
    const anchorIndex = anchorId >= 0 ? siblings.indexOf(anchorId) : -1;
    const insertionIndex = anchorIndex >= 0 ? anchorIndex : siblings.length;
    siblings.splice(insertionIndex, 0, nodeId);
    this.children.set(parentId, siblings);
    this.parent.set(nodeId, parentId);

    this.delegate?.insertNode(parentId, nodeId, anchorId);
  }

  removeNode(parentId: number, nodeId: number): void {
    this.counts.removeNode += 1;
    this.delegate?.removeNode(parentId, nodeId);

    const siblings = this.children.get(parentId);
    if (siblings) {
      const index = siblings.indexOf(nodeId);
      if (index >= 0) siblings.splice(index, 1);
    }
    this.parent.delete(nodeId);
    this.destroyTrackedSubtree(nodeId);
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    const key = `${id}:${event}`;
    if (enabled) {
      this.counts.eventEnable += 1;
      this.enabledEvents.add(key);
    } else {
      this.counts.eventDisable += 1;
      this.enabledEvents.delete(key);
    }
    this.delegate?.setEventEnabled(id, event, enabled);
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    return this.delegate?.callModuleSync(module, method, argsJSON) ??
      JSON.stringify({ ok: true, value: null });
  }

  private trackNode(id: number): void {
    this.aliveNodes.add(id);
    this.children.set(id, []);
  }

  private detachTrackedNode(nodeId: number): void {
    const previousParentId = this.parent.get(nodeId);
    if (previousParentId === undefined) return;

    const previousSiblings = this.children.get(previousParentId);
    if (previousSiblings) {
      const index = previousSiblings.indexOf(nodeId);
      if (index >= 0) previousSiblings.splice(index, 1);
    }
    this.parent.delete(nodeId);
  }

  private destroyTrackedSubtree(nodeId: number): void {
    for (const childId of [...(this.children.get(nodeId) ?? [])]) {
      this.destroyTrackedSubtree(childId);
    }

    this.children.delete(nodeId);
    this.parent.delete(nodeId);
    this.aliveNodes.delete(nodeId);

    const eventPrefix = `${nodeId}:`;
    for (const key of [...this.enabledEvents]) {
      if (key.startsWith(eventPrefix)) this.enabledEvents.delete(key);
    }
  }
}

function runCreateRootOwnership(context: ScenarioContext): void {
  let parentDispose!: () => void;
  let childDispose!: () => void;
  let parentCleanupCount = 0;
  let childCleanupCount = 0;
  let parentOwner: ReturnType<typeof getOwner> = null;
  let childOwner: ReturnType<typeof getOwner> = null;

  createRoot(dispose => {
    parentDispose = dispose;
    parentOwner = getOwner();
    onCleanup(() => {
      parentCleanupCount += 1;
    });

    createRoot(disposeChild => {
      childDispose = disposeChild;
      childOwner = getOwner();
      onCleanup(() => {
        childCleanupCount += 1;
      });
    });
  });

  context.assert('createRoot establishes an owner', parentOwner != null);
  context.assert(
    'nested createRoot establishes a distinct child owner',
    childOwner != null && childOwner !== parentOwner,
  );

  parentDispose();
  context.assert('parent disposal runs parent cleanup exactly once', parentCleanupCount === 1);
  context.assert(
    'Solid 2 nested createRoot is owned by its parent and disposes automatically',
    childCleanupCount === 1,
  );

  childDispose();
  parentDispose();
  context.assert('manual child disposal after parent disposal is idempotent', childCleanupCount === 1);
  context.assert('repeated parent disposal is idempotent', parentCleanupCount === 1);
}

function runEffectSemantics(context: ScenarioContext): void {
  const effectLog: string[] = [];
  let setEffectValue!: Setter<number>;
  let disposeEffect!: () => void;

  createRoot(dispose => {
    disposeEffect = dispose;
    const [value, setValue] = createSignal(0);
    setEffectValue = setValue;

    createEffect(
      () => {
        const next = value();
        effectLog.push(`compute:${next}`);
        return next;
      },
      next => {
        effectLog.push(`apply:${next}`);
        return () => {
          effectLog.push(`cleanup:${next}`);
        };
      },
    );
  });

  context.assert(
    'createEffect apply phase waits for settlement',
    !effectLog.includes('apply:0'),
    JSON.stringify(effectLog),
  );
  flush();
  context.assert('createEffect initial apply runs exactly once', countEntry(effectLog, 'apply:0') === 1);
  assertOrdered(context, 'createEffect compute precedes apply', effectLog, 'compute:0', 'apply:0');

  setEffectValue(1);
  flush();
  context.assert('createEffect update applies exactly once', countEntry(effectLog, 'apply:1') === 1);
  context.assert('createEffect previous apply cleanup runs exactly once', countEntry(effectLog, 'cleanup:0') === 1);
  assertOrdered(context, 'createEffect previous cleanup precedes replacement apply', effectLog, 'cleanup:0', 'apply:1');
  assertOrdered(context, 'createEffect update compute precedes update apply', effectLog, 'compute:1', 'apply:1');

  disposeEffect();
  context.assert('createEffect final apply cleanup runs on owner disposal', countEntry(effectLog, 'cleanup:1') === 1);

  setEffectValue(2);
  flush();
  context.assert(
    'disposed createEffect never runs a stale callback',
    !effectLog.includes('compute:2') && !effectLog.includes('apply:2'),
    JSON.stringify(effectLog),
  );

  const renderLog: string[] = [];
  let setRenderValue!: Setter<number>;
  let disposeRenderEffect!: () => void;

  createRoot(dispose => {
    disposeRenderEffect = dispose;
    const [value, setValue] = createSignal(0);
    setRenderValue = setValue;

    createRenderEffect(
      () => {
        const next = value();
        renderLog.push(`compute:${next}`);
        return next;
      },
      next => {
        renderLog.push(`apply:${next}`);
        return () => {
          renderLog.push(`cleanup:${next}`);
        };
      },
    );
  });

  context.assert(
    'createRenderEffect applies synchronously during render',
    countEntry(renderLog, 'apply:0') === 1,
    JSON.stringify(renderLog),
  );
  setRenderValue(1);
  flush();
  context.assert('createRenderEffect update applies exactly once', countEntry(renderLog, 'apply:1') === 1);
  context.assert('createRenderEffect previous cleanup runs exactly once', countEntry(renderLog, 'cleanup:0') === 1);
  assertOrdered(
    context,
    'createRenderEffect previous cleanup precedes replacement apply',
    renderLog,
    'cleanup:0',
    'apply:1',
  );

  disposeRenderEffect();
  context.assert(
    'createRenderEffect final cleanup runs on owner disposal',
    countEntry(renderLog, 'cleanup:1') === 1,
  );

  setRenderValue(2);
  flush();
  context.assert(
    'disposed createRenderEffect never runs a stale callback',
    !renderLog.includes('compute:2') && !renderLog.includes('apply:2'),
    JSON.stringify(renderLog),
  );
}

function runSettledSemantics(context: ScenarioContext): void {
  let dispose!: () => void;
  let settledRuns = 0;
  let settledCleanups = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    onSettled(() => {
      settledRuns += 1;
      return () => {
        settledCleanups += 1;
      };
    });
  });

  context.assert('onSettled does not run before the graph settles', settledRuns === 0);
  flush();
  context.assert('onSettled runs exactly once after settlement', settledRuns === 1);
  dispose();
  context.assert('onSettled returned cleanup runs on owner disposal', settledCleanups === 1);

  const order: string[] = [];
  createRoot(rootDispose => {
    onSettled(() => {
      order.push('outer');
      onSettled(() => {
        order.push('inner');
      });
    });
    onCleanup(() => {
      order.push('cleanup');
    });
    dispose = rootDispose;
  });

  flush();
  context.assert(
    'nested onSettled callbacks preserve deterministic outer-to-inner ordering',
    order.length === 2 && order[0] === 'outer' && order[1] === 'inner',
    JSON.stringify(order),
  );
  dispose();
  context.assert(
    'owner cleanup follows settled callbacks',
    order.length === 3 && order[2] === 'cleanup',
    JSON.stringify(order),
  );
}

const OwnedContext = createContext<{ readonly label: string }>();

function ContextConsumer(props: { observe(value: string): void; cleanup(): void }) {
  const value = useContext(OwnedContext);
  props.observe(value.label);
  onCleanup(props.cleanup);
  return null;
}

function runContextOwnership(context: ScenarioContext): void {
  let missingProviderThrows = false;
  try {
    createRoot(() => useContext(OwnedContext));
  } catch {
    missingProviderThrows = true;
  }
  context.assert('default-less Solid 2 context throws without a provider', missingProviderThrows);

  const observed: string[] = [];
  let cleanups = 0;
  let dispose!: () => void;

  createRoot(rootDispose => {
    dispose = rootDispose;

    const subtree = (
      <OwnedContext value={{ label: 'owned-context' }}>
        <ContextConsumer
          observe={value => observed.push(value)}
          cleanup={() => {
            cleanups += 1;
          }}
        />
      </OwnedContext>
    );

    // Solid 2 context providers return a lazy children accessor. A real
    // renderer consumes it while mounting; this headless lifecycle scenario
    // must explicitly resolve it so the descendant is created under the
    // provider's owner/context.
    const resolvedSubtree: unknown = subtree;
    if (typeof resolvedSubtree === 'function') {
      (resolvedSubtree as () => unknown)();
    }
  });

  context.assert(
    'context consumer reads the value from its owning provider',
    observed.length === 1 && observed[0] === 'owned-context',
    JSON.stringify(observed),
  );
  dispose();
  context.assert('context consumer cleanup follows provider subtree disposal', cleanups === 1);
}

async function settlePromiseJobs(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function runAsyncOwnership(context: ScenarioContext): Promise<void> {
  const request = deferred<string>();
  let dispose!: () => void;
  let memoStarts = 0;
  let memoCleanups = 0;
  let effectApplies = 0;
  let effectCleanups = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    const value = createMemo(() => {
      memoStarts += 1;
      onCleanup(() => {
        memoCleanups += 1;
      });
      return request.promise;
    });

    createEffect(value, () => {
      effectApplies += 1;
      return () => {
        effectCleanups += 1;
      };
    });
  });

  flush();
  context.assert('async memo starts exactly one owned request', memoStarts === 1);
  context.assert('pending async memo has not applied a settled effect', effectApplies === 0);

  dispose();
  context.assert('disposing an async owner cleans the pending memo immediately', memoCleanups === 1);

  request.resolve('too-late');
  await settlePromiseJobs();
  flush();

  context.assert('late async settlement does not apply after owner disposal', effectApplies === 0);
  context.assert('late async settlement does not manufacture effect cleanup', effectCleanups === 0);
  context.assert('late async settlement does not rerun memo cleanup', memoCleanups === 1);
}

function runRootStress(context: ScenarioContext, cycles: number, sampleWidth: number, prefix: string): void {
  const timings: number[] = [];
  let mounts = 0;
  let cleanups = 0;

  for (let offset = 0; offset < cycles; offset += sampleWidth) {
    const end = Math.min(cycles, offset + sampleWidth);
    const start = context.now();

    for (let index = offset; index < end; index += 1) {
      let dispose!: () => void;
      createRoot(rootDispose => {
        dispose = rootDispose;
        mounts += 1;
        onCleanup(() => {
          cleanups += 1;
        });
      });
      dispose();
    }

    timings.push(context.now() - start);
  }

  context.assert(`${cycles.toLocaleString()} createRoot cycles all mount`, mounts === cycles);
  context.assert(`${cycles.toLocaleString()} createRoot cycles all clean up`, cleanups === cycles);
  recordDistribution(context, prefix, timings);
}

function NativeLifecycleSubtree(props: {
  onPress(): void;
  onDispose(): void;
}): HostNode {
  onCleanup(props.onDispose);

  const subtree = View({ accessibilityLabel: 'lifecycle-subtree' });
  insert(
    subtree,
    Text({
      accessibilityLabel: 'lifecycle-text',
      children: 'Owned native subtree',
    }),
  );
  insert(
    subtree,
    Button({
      accessibilityLabel: 'lifecycle-button',
      onPress: props.onPress,
      children: 'Press',
    }),
  );
  return subtree;
}

function runNativeLifecycle(context: ScenarioContext): void {
  const originalBridge = globalThis.__stingNativeBridge;
  const probe = new LifecycleBridgeProbe(originalBridge);
  let disposeRender: (() => void) | undefined;

  resetNativeBridgeForTests();

  try {
    const host = installNativeBridge(probe);
    const baselineRootChildren = host.root.children.length;
    let setMounted!: Setter<boolean>;
    let pressCount = 0;
    let subtreeCleanups = 0;
    let staleCallbackFailures = 0;
    let ghostNodeFailures = 0;
    let eventBaselineFailures = 0;
    const buttonIds = new Set<number>();
    const timings: number[] = [];
    const cycles = 1_000;
    const sampleWidth = 10;

    disposeRender = renderApp(() => {
      const [mounted, set] = createSignal(false);
      setMounted = set;
      const root = View({ accessibilityLabel: 'lifecycle-root' });

      insert(root, () =>
        mounted()
          ? createComponent(NativeLifecycleSubtree, {
              onPress() {
                pressCount += 1;
              },
              onDispose() {
                subtreeCleanups += 1;
              },
            })
          : null,
      );

      return root;
    });

    flush();
    const mountedBaselineNodes = probe.aliveNodeCount;
    context.assert('native lifecycle fixture mounts exactly one stable root node', mountedBaselineNodes === 1);
    context.assert('native lifecycle fixture begins with no enabled events', probe.enabledEventCount === 0);

    for (let offset = 0; offset < cycles; offset += sampleWidth) {
      const end = Math.min(cycles, offset + sampleWidth);
      const start = context.now();

      for (let index = offset; index < end; index += 1) {
        const pressesBeforeMount = pressCount;
        setMounted(true);
        flush();

        const mountedButtonId = findHostNode(host.root, 'button')?.id ?? -1;
        if (mountedButtonId >= 0) buttonIds.add(mountedButtonId);
        if (mountedButtonId < 0 || probe.enabledEventCount !== 1) {
          eventBaselineFailures += 1;
        }

        host.dispatchEvent(mountedButtonId, 'press');
        if (pressCount !== pressesBeforeMount + 1) staleCallbackFailures += 1;

        setMounted(false);
        flush();

        if (probe.aliveNodeCount !== mountedBaselineNodes) ghostNodeFailures += 1;
        if (probe.enabledEventCount !== 0) eventBaselineFailures += 1;

        host.dispatchEvent(mountedButtonId, 'press');
        if (pressCount !== pressesBeforeMount + 1) staleCallbackFailures += 1;
      }

      timings.push(context.now() - start);
    }

    context.assert('1,000 conditional native subtrees dispose exactly once', subtreeCleanups === cycles);
    context.assert('1,000 native button identities are never recycled while the host is alive', buttonIds.size === cycles);
    context.assert('disposed native event handlers never receive stale callbacks', staleCallbackFailures === 0);
    context.assert('native node count returns to mounted baseline after every cycle', ghostNodeFailures === 0);
    context.assert('native event count returns to zero after every cycle', eventBaselineFailures === 0);
    context.assert('every native button event is enabled exactly once', probe.counts.eventEnable === cycles);
    context.assert('every disposed native button event is disabled exactly once', probe.counts.eventDisable === cycles);

    disposeRender();
    disposeRender = undefined;
    flush();

    context.assert(
      'component/subtree disposal returns Sting shadow root children to baseline',
      host.root.children.length === baselineRootChildren,
    );
    context.assert('native node references return to baseline after root disposal', probe.aliveNodeCount === 0);
    context.assert('native event references return to baseline after root disposal', probe.enabledEventCount === 0);

    recordDistribution(context, 'native-mount-unmount-1k', timings);
    context.metric('native.createElement', probe.counts.createElement, 'mutations');
    context.metric('native.createTextNode', probe.counts.createTextNode, 'mutations');
    context.metric('native.replaceText', probe.counts.replaceText, 'mutations');
    context.metric('native.setProperty', probe.counts.setProperty, 'mutations');
    context.metric('native.insertNode', probe.counts.insertNode, 'mutations');
    context.metric('native.removeNode', probe.counts.removeNode, 'mutations');
    context.metric('native.eventEnable', probe.counts.eventEnable, 'mutations');
    context.metric('native.eventDisable', probe.counts.eventDisable, 'mutations');
  } finally {
    disposeRender?.();
    resetNativeBridgeForTests();
    if (originalBridge) installNativeBridge(originalBridge);
  }
}

export const scenario: ScenarioDefinition = {
  id: 'lifecycle',
  title: 'Solid 2 lifecycle, ownership, cleanup, and native disposal',
  workstream: 'lifecycle',
  kind: 'hybrid',
  async run(context) {
    runCreateRootOwnership(context);
    runEffectSemantics(context);
    runSettledSemantics(context);
    runContextOwnership(context);
    await runAsyncOwnership(context);
    runRootStress(context, 1_000, 10, 'create-root-1k');
    runRootStress(context, 10_000, 100, 'create-root-10k');
    runNativeLifecycle(context);
  },
};
