import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingNativeBridge,
} from '@stingjs/core';
import { Button, View } from '@stingjs/native';
import { Dynamic, Match, Show, Switch, renderApp } from '@stingjs/solid';
import { createSignal, flush } from 'solid-js';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';

type Operation =
  | { kind: 'createElement'; id: number; type: string }
  | { kind: 'createTextNode'; id: number; value: string }
  | { kind: 'replaceText'; id: number; value: string }
  | { kind: 'setProperty'; id: number; name: string; valueJSON: string }
  | { kind: 'insertNode'; parentId: number; nodeId: number; anchorId: number }
  | { kind: 'removeNode'; parentId: number; nodeId: number }
  | { kind: 'setEventEnabled'; id: number; event: string; enabled: boolean };

type OperationKind = Operation['kind'];
type NativeComponent = () => HostNode;
type DynamicSelection = NativeComponent | 'view' | undefined;

const OPERATION_KINDS: readonly OperationKind[] = [
  'createElement',
  'createTextNode',
  'replaceText',
  'setProperty',
  'insertNode',
  'removeNode',
  'setEventEnabled',
];

class RecordingBridge implements StingNativeBridge {
  private operations: Operation[] = [];

  constructor(readonly target: StingNativeBridge) {}

  take(): Operation[] {
    const taken = this.operations;
    this.operations = [];
    return taken;
  }

  getRuntimeInfo(): string {
    return this.target.getRuntimeInfo();
  }

  createElement(id: number, type: string): void {
    this.operations.push({ kind: 'createElement', id, type });
    this.target.createElement(id, type);
  }

  createTextNode(id: number, value: string): void {
    this.operations.push({ kind: 'createTextNode', id, value });
    this.target.createTextNode(id, value);
  }

  replaceText(id: number, value: string): void {
    this.operations.push({ kind: 'replaceText', id, value });
    this.target.replaceText(id, value);
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    this.operations.push({ kind: 'setProperty', id, name, valueJSON });
    this.target.setProperty(id, name, valueJSON);
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
    this.target.insertNode(parentId, nodeId, anchorId);
  }

  removeNode(parentId: number, nodeId: number): void {
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
    this.target.removeNode(parentId, nodeId);
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
    this.target.setEventEnabled(id, event, enabled);
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    return this.target.callModuleSync(module, method, argsJSON);
  }
}

function createPortableFallbackBridge(): StingNativeBridge {
  return {
    getRuntimeInfo() {
      return JSON.stringify({
        protocolVersion: STING_PROTOCOL_VERSION,
        platform: 'ios',
        modules: { Solid2Conformance: 'portable-fallback' },
      });
    },
    createElement() {},
    createTextNode() {},
    replaceText() {},
    setProperty() {},
    insertNode() {},
    removeNode() {},
    setEventEnabled() {},
    callModuleSync() {
      return JSON.stringify({ ok: true, value: null });
    },
  };
}

function count(operations: readonly Operation[], kind: OperationKind): number {
  return operations.reduce((total, operation) => total + (operation.kind === kind ? 1 : 0), 0);
}

function trace(operations: readonly Operation[]): string {
  return operations
    .map(operation => {
      switch (operation.kind) {
        case 'createElement':
          return `createElement(${operation.id},${operation.type})`;
        case 'createTextNode':
          return `createTextNode(${operation.id},${JSON.stringify(operation.value)})`;
        case 'replaceText':
          return `replaceText(${operation.id},${JSON.stringify(operation.value)})`;
        case 'setProperty':
          return `setProperty(${operation.id},${operation.name})`;
        case 'insertNode':
          return `insertNode(${operation.parentId},${operation.nodeId},${operation.anchorId})`;
        case 'removeNode':
          return `removeNode(${operation.parentId},${operation.nodeId})`;
        case 'setEventEnabled':
          return `setEventEnabled(${operation.id},${operation.event},${operation.enabled})`;
      }
    })
    .join(' > ');
}

function assertCounts(
  context: ScenarioContext,
  label: string,
  operations: readonly Operation[],
  expected: Partial<Record<OperationKind, number>>,
): void {
  for (const kind of OPERATION_KINDS) {
    const expectedCount = expected[kind];
    if (expectedCount === undefined) continue;
    const actual = count(operations, kind);
    context.assert(
      `${label}: ${kind}`,
      actual === expectedCount,
      `expected ${expectedCount}, got ${actual}: ${trace(operations)}`,
    );
  }
}

function assertNodeReplacementOrder(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
  parentId: number,
  oldNodeId: number,
  newNodeId: number,
): void {
  const insertIndex = operations.findIndex(
    operation =>
      operation.kind === 'insertNode' &&
      operation.parentId === parentId &&
      operation.nodeId === newNodeId &&
      operation.anchorId === oldNodeId,
  );
  const removeIndex = operations.findIndex(
    operation =>
      operation.kind === 'removeNode' &&
      operation.parentId === parentId &&
      operation.nodeId === oldNodeId,
  );

  context.assert(
    name,
    insertIndex >= 0 && removeIndex > insertIndex,
    `node replacement must anchor-insert before remove: ${trace(operations)}`,
  );
}

function assertTextReplacementOrder(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
  parentId: number,
  oldNodeId: number,
  newTextNodeId: number,
): void {
  const createIndex = operations.findIndex(
    operation => operation.kind === 'createTextNode' && operation.id === newTextNodeId,
  );
  const removeIndex = operations.findIndex(
    operation =>
      operation.kind === 'removeNode' &&
      operation.parentId === parentId &&
      operation.nodeId === oldNodeId,
  );
  const insertIndex = operations.findIndex(
    operation =>
      operation.kind === 'insertNode' &&
      operation.parentId === parentId &&
      operation.nodeId === newTextNodeId &&
      operation.anchorId === -1,
  );

  context.assert(
    name,
    createIndex >= 0 && removeIndex > createIndex && insertIndex > removeIndex,
    `Solid universal raw-text replacement must create, remove, then insert: ${trace(operations)}`,
  );
}

function assertEventDisabledBeforeRemoval(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
  eventNodeId: number,
  removedNodeId: number,
): void {
  const disableIndex = operations.findIndex(
    operation =>
      operation.kind === 'setEventEnabled' &&
      operation.id === eventNodeId &&
      operation.event === 'press' &&
      operation.enabled === false,
  );
  const removeIndex = operations.findIndex(
    operation => operation.kind === 'removeNode' && operation.nodeId === removedNodeId,
  );

  context.assert(
    name,
    disableIndex >= 0 && removeIndex > disableIndex,
    `event teardown must happen before native removal: ${trace(operations)}`,
  );
}

function collectSubtreeIds(node: HostNode, target = new Set<number>()): Set<number> {
  target.add(node.id);
  for (const child of node.children) collectSubtreeIds(child, target);
  return target;
}

function retire(retired: Set<number>, node: HostNode): void {
  for (const id of collectSubtreeIds(node)) retired.add(id);
}

function dispatchPress(nodeId: number): void {
  const dispatch = globalThis.__stingDispatchEvent;
  if (!dispatch) throw new Error('Sting conformance event dispatcher is unavailable');
  dispatch(nodeId, 'press', 'null');
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function recordLatencyMetrics(context: ScenarioContext, samples: readonly number[]): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = sorted.length
    ? sorted.reduce((total, sample) => total + sample, 0) / sorted.length
    : 0;

  context.metric('rapid-branch.samples', sorted.length, 'samples');
  context.metric('rapid-branch.min', sorted[0] ?? 0, 'ms/toggle');
  context.metric('rapid-branch.mean', mean, 'ms/toggle');
  context.metric('rapid-branch.p50', percentile(sorted, 0.50), 'ms/toggle');
  context.metric('rapid-branch.p95', percentile(sorted, 0.95), 'ms/toggle');
  context.metric('rapid-branch.p99', percentile(sorted, 0.99), 'ms/toggle');
  context.metric('rapid-branch.max', sorted[sorted.length - 1] ?? 0, 'ms/toggle');
}

function update(write: () => void): void {
  write();
  flush();
}

export const scenario: ScenarioDefinition = {
  id: 'control-flow',
  title: 'Solid 2 native control-flow identity, replacement, and teardown',
  workstream: 'control-flow',
  kind: 'hybrid',

  run(context) {
    const nativeBridge = globalThis.__stingNativeBridge;
    const recording = new RecordingBridge(nativeBridge ?? createPortableFallbackBridge());

    resetNativeBridgeForTests();
    const host = installNativeBridge(recording);

    const [showValue, setShowValue] = createSignal<string | null>('alpha');
    const [outerVisible, setOuterVisible] = createSignal(true);
    const [innerVisible, setInnerVisible] = createSignal(true);
    const [route, setRoute] = createSignal<'one' | 'two' | 'none'>('one');
    const [matchPayload, setMatchPayload] = createSignal('match-a');
    const [textAsComponent, setTextAsComponent] = createSignal(false);
    const [stressOn, setStressOn] = createSignal(false);

    let showHits = 0;
    let showObserved = '';
    let nestedHits = 0;
    let switchHits = 0;
    let switchObserved = '';
    let dynamicAHits = 0;
    let dynamicBHits = 0;
    let stressHits = 0;

    const DynamicA: NativeComponent = () => <Button onPress={() => dynamicAHits++} />;
    const DynamicB: NativeComponent = () => <Button onPress={() => dynamicBHits++} />;
    const [dynamicSelection, setDynamicSelection] = createSignal<DynamicSelection>(DynamicA);

    const NestedLive: NativeComponent = () => (
      <View><Button onPress={() => nestedHits++} /></View>
    );
    const NestedInnerFallback: NativeComponent = () => (
      <View><Button onPress={() => nestedHits++} /></View>
    );
    const NestedOuterFallback: NativeComponent = () => (
      <View><Button onPress={() => nestedHits++} /></View>
    );
    const StressOn: NativeComponent = () => <Button onPress={() => stressHits++} />;
    const StressOff: NativeComponent = () => <Button onPress={() => stressHits++} />;

    const dispose = renderApp(() => (
      <View>
        <View />
        <View>
          <Show when={showValue()} fallback={<Button />}>
            {value => (
              <Button onPress={() => {
                showHits++;
                showObserved = value();
              }} />
            )}
          </Show>
        </View>
        <View>
          <Show when={outerVisible()} fallback={<NestedOuterFallback />}>
            <Show when={innerVisible()} fallback={<NestedInnerFallback />}>
              <NestedLive />
            </Show>
          </Show>
        </View>
        <View>
          <Switch fallback={<Button />}>
            <Match when={route() === 'one' ? matchPayload() : false}>
              {value => (
                <Button onPress={() => {
                  switchHits++;
                  switchObserved = value();
                }} />
              )}
            </Match>
            <Match when={route() === 'two'}>
              <Button onPress={() => switchHits++} />
            </Match>
          </Switch>
        </View>
        <View>
          <Dynamic component={dynamicSelection() as never} />
        </View>
        <View>
          <Show when={textAsComponent()} fallback="plain-text">
            <Button />
          </Show>
        </View>
        <View>
          <Show when={stressOn()} fallback={<StressOff />}>
            <StressOn />
          </Show>
        </View>
        <View />
      </View>
    ));

    const retiredIds = new Set<number>();
    const transitionOperations: Operation[] = [];
    const capture = (): Operation[] => {
      const operations = recording.take();
      transitionOperations.push(...operations);
      return operations;
    };

    try {
      const appRoot = host.root.children[0];
      context.assert('root app mounted as one native view', appRoot?.type === 'view');
      if (!appRoot) return;
      context.assert(
        'all eight stable control-flow sections mounted',
        appRoot.children.length === 8,
        `children=${appRoot.children.length}`,
      );

      const stableLeft = appRoot.children[0]!;
      const showSection = appRoot.children[1]!;
      const nestedSection = appRoot.children[2]!;
      const switchSection = appRoot.children[3]!;
      const dynamicSection = appRoot.children[4]!;
      const textSection = appRoot.children[5]!;
      const stressSection = appRoot.children[6]!;
      const stableRight = appRoot.children[7]!;
      const stableLeftId = stableLeft.id;
      const stableRightId = stableRight.id;

      recording.take();

      // <Show>: truthy payload changes keep the same native branch and accessor.
      const initialShow = showSection.children[0]!;
      dispatchPress(initialShow.id);
      context.assert('Show initial event handler is live', showHits === 1);
      context.assert('Show narrowed accessor starts at alpha', showObserved === 'alpha');

      update(() => setShowValue('beta'));
      let operations = capture();
      context.assert('Show truthy change preserves native identity', showSection.children[0] === initialShow);
      context.assert('Show truthy change emits zero native mutations', operations.length === 0, trace(operations));
      dispatchPress(initialShow.id);
      context.assert('Show narrowed accessor observes beta without remount', showObserved === 'beta');

      retire(retiredIds, initialShow);
      const showHitsBeforeRemoval = showHits;
      update(() => setShowValue(null));
      operations = capture();
      const showFallback = showSection.children[0]!;
      assertCounts(context, 'Show truthy-to-fallback', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 1,
      });
      assertNodeReplacementOrder(
        context,
        'Show inserts fallback before removing old branch',
        operations,
        showSection.id,
        initialShow.id,
        showFallback.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'Show disables removed event before native removal',
        operations,
        initialShow.id,
        initialShow.id,
      );
      dispatchPress(initialShow.id);
      context.assert('Show removed branch cannot receive stale events', showHits === showHitsBeforeRemoval);

      retire(retiredIds, showFallback);
      update(() => setShowValue('gamma'));
      operations = capture();
      const remountedShow = showSection.children[0]!;
      assertCounts(context, 'Show fallback-to-truthy', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 1,
      });
      context.assert('Show remount receives fresh identity', remountedShow.id !== initialShow.id);
      assertNodeReplacementOrder(
        context,
        'Show remount anchors before fallback removal',
        operations,
        showSection.id,
        showFallback.id,
        remountedShow.id,
      );

      // Nested <Show>: native removal is rooted at the subtree, but descendant
      // handlers must be disabled before that native root disappears.
      const initialNestedRoot = nestedSection.children[0]!;
      const initialNestedButton = initialNestedRoot.children[0]!;
      retire(retiredIds, initialNestedRoot);
      const nestedHitsBeforeRemoval = nestedHits;
      update(() => setInnerVisible(false));
      operations = capture();
      const innerFallbackRoot = nestedSection.children[0]!;
      assertCounts(context, 'nested inner replacement', operations, {
        createElement: 2,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 2,
        removeNode: 1,
        setEventEnabled: 2,
      });
      assertNodeReplacementOrder(
        context,
        'nested replacement inserts new root before removing old root',
        operations,
        nestedSection.id,
        initialNestedRoot.id,
        innerFallbackRoot.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'nested descendant event is disabled before parent subtree removal',
        operations,
        initialNestedButton.id,
        initialNestedRoot.id,
      );
      dispatchPress(initialNestedButton.id);
      context.assert('nested removed descendant cannot receive stale event', nestedHits === nestedHitsBeforeRemoval);

      const innerFallbackButton = innerFallbackRoot.children[0]!;
      retire(retiredIds, innerFallbackRoot);
      update(() => setOuterVisible(false));
      operations = capture();
      const outerFallbackRoot = nestedSection.children[0]!;
      assertCounts(context, 'nested outer replacement', operations, {
        createElement: 2,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 2,
        removeNode: 1,
        setEventEnabled: 2,
      });
      assertEventDisabledBeforeRemoval(
        context,
        'outer replacement disables nested event before parent removal',
        operations,
        innerFallbackButton.id,
        innerFallbackRoot.id,
      );

      retire(retiredIds, outerFallbackRoot);
      update(() => setOuterVisible(true));
      capture();
      update(() => setInnerVisible(true));
      capture();
      context.assert('nested conditionals finish with exactly one subtree root', nestedSection.children.length === 1);

      // <Switch>/<Match>: selected truthy Match preserves identity and exposes
      // current payload through the RC's guarded narrowed accessor.
      const firstMatch = switchSection.children[0]!;
      update(() => setMatchPayload('match-b'));
      operations = capture();
      context.assert('Match payload update preserves selected native identity', switchSection.children[0] === firstMatch);
      context.assert('Match payload-only update emits zero native mutations', operations.length === 0, trace(operations));
      dispatchPress(firstMatch.id);
      context.assert('Match narrowed accessor observes match-b', switchObserved === 'match-b');

      retire(retiredIds, firstMatch);
      const switchHitsBeforeRemoval = switchHits;
      update(() => setRoute('two'));
      operations = capture();
      const secondMatch = switchSection.children[0]!;
      assertCounts(context, 'Switch first-to-second Match', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 2,
      });
      assertNodeReplacementOrder(
        context,
        'Switch inserts winning Match before old Match removal',
        operations,
        switchSection.id,
        firstMatch.id,
        secondMatch.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'Switch disables losing Match handler before removal',
        operations,
        firstMatch.id,
        firstMatch.id,
      );
      dispatchPress(firstMatch.id);
      context.assert('losing Match cannot receive stale events', switchHits === switchHitsBeforeRemoval);

      retire(retiredIds, secondMatch);
      update(() => setRoute('none'));
      operations = capture();
      assertCounts(context, 'Switch second Match-to-fallback', operations, {
        createElement: 1,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 1,
      });
      context.assert('Switch fallback leaves exactly one native branch', switchSection.children.length === 1);

      // Native <Dynamic>: component -> component -> intrinsic -> null -> component.
      const dynamicA = dynamicSection.children[0]!;
      retire(retiredIds, dynamicA);
      const dynamicAHitsBeforeRemoval = dynamicAHits;
      update(() => setDynamicSelection(() => DynamicB));
      operations = capture();
      const dynamicB = dynamicSection.children[0]!;
      assertCounts(context, 'Dynamic component-to-component', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 2,
      });
      assertNodeReplacementOrder(
        context,
        'Dynamic component replacement anchors before removal',
        operations,
        dynamicSection.id,
        dynamicA.id,
        dynamicB.id,
      );
      dispatchPress(dynamicA.id);
      context.assert('Dynamic old component handler is stale-safe', dynamicAHits === dynamicAHitsBeforeRemoval);

      retire(retiredIds, dynamicB);
      const dynamicBHitsBeforeRemoval = dynamicBHits;
      update(() => setDynamicSelection('view'));
      operations = capture();
      const dynamicIntrinsic = dynamicSection.children[0]!;
      context.assert('Dynamic intrinsic uses Sting native view, not DOM', dynamicIntrinsic.type === 'view');
      assertCounts(context, 'Dynamic component-to-intrinsic', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 1,
      });
      dispatchPress(dynamicB.id);
      context.assert('Dynamic replaced component handler is removed', dynamicBHits === dynamicBHitsBeforeRemoval);

      retire(retiredIds, dynamicIntrinsic);
      update(() => setDynamicSelection(undefined));
      operations = capture();
      assertCounts(context, 'Dynamic intrinsic-to-null', operations, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 0,
        removeNode: 1,
        setEventEnabled: 0,
      });
      context.assert('Dynamic component-to-null leaves no native child', dynamicSection.children.length === 0);

      update(() => setDynamicSelection(() => DynamicA));
      operations = capture();
      const remountedDynamicA = dynamicSection.children[0]!;
      assertCounts(context, 'Dynamic null-to-component', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 0,
        setEventEnabled: 1,
      });
      context.assert('Dynamic null-to-component receives fresh identity', remountedDynamicA.id !== dynamicA.id);

      // Raw text <-> component exercises both universal replacement paths. Node
      // replacement anchors before remove; raw-text cleanChildren removes first.
      const initialText = textSection.children[0]!;
      context.assert('text/component lane begins with a raw native text node', initialText.type === '#text');
      retire(retiredIds, initialText);
      update(() => setTextAsComponent(true));
      operations = capture();
      const textBranchButton = textSection.children[0]!;
      assertCounts(context, 'text-to-component', operations, {
        createElement: 1,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 0,
      });
      assertNodeReplacementOrder(
        context,
        'text-to-component anchors component before text removal',
        operations,
        textSection.id,
        initialText.id,
        textBranchButton.id,
      );

      retire(retiredIds, textBranchButton);
      update(() => setTextAsComponent(false));
      operations = capture();
      const replacementText = textSection.children[0]!;
      context.assert('component-to-text restores raw native text', replacementText.type === '#text');
      assertCounts(context, 'component-to-text', operations, {
        createElement: 0,
        createTextNode: 1,
        replaceText: 0,
        setProperty: 0,
        insertNode: 1,
        removeNode: 1,
        setEventEnabled: 0,
      });
      assertTextReplacementOrder(
        context,
        'component-to-text follows Solid universal cleanChildren ordering',
        operations,
        textSection.id,
        textBranchButton.id,
        replacementText.id,
      );

      // Deterministic stress: no timers or network. Portable hosts call the same
      // scenario API and get stable mutation totals plus latency distributions.
      const sampleCount = 20;
      const togglesPerSample = 50;
      const totalToggles = sampleCount * togglesPerSample;
      const latencySamples: number[] = [];
      const retiredStressIds: number[] = [];
      recording.take();

      for (let sample = 0; sample < sampleCount; sample++) {
        const started = context.now();
        for (let index = 0; index < togglesPerSample; index++) {
          const previous = stressSection.children[0]!;
          retiredStressIds.push(previous.id);
          retiredIds.add(previous.id);
          setStressOn(value => !value);
          flush();
        }
        latencySamples.push((context.now() - started) / togglesPerSample);
      }

      const stressOperations = capture();
      recordLatencyMetrics(context, latencySamples);
      for (const kind of OPERATION_KINDS) {
        context.metric(`rapid-branch.native.${kind}`, count(stressOperations, kind), 'mutations');
      }
      context.metric('native-bridge-forwarded', nativeBridge ? 1 : 0, 'boolean');

      assertCounts(context, '1,000 rapid branch swaps', stressOperations, {
        createElement: totalToggles,
        createTextNode: 0,
        replaceText: 0,
        setProperty: 0,
        insertNode: totalToggles,
        removeNode: totalToggles,
        setEventEnabled: totalToggles * 2,
      });
      context.assert('rapid swaps leave exactly one live branch', stressSection.children.length === 1);

      const eventsBeforeStaleDispatch =
        showHits + nestedHits + switchHits + dynamicAHits + dynamicBHits + stressHits;
      for (const nodeId of retiredStressIds) dispatchPress(nodeId);
      const eventsAfterStaleDispatch =
        showHits + nestedHits + switchHits + dynamicAHits + dynamicBHits + stressHits;
      context.assert(
        '1,000 retired rapid-swap node ids cannot dispatch stale handlers',
        eventsAfterStaleDispatch === eventsBeforeStaleDispatch,
      );

      const reachable = collectSubtreeIds(host.root);
      const ghostId = [...retiredIds].find(id => reachable.has(id));
      context.assert(
        'retired conditional nodes and descendants are absent from the live shadow tree',
        ghostId === undefined,
        ghostId === undefined ? undefined : `retired node ${ghostId} is still reachable`,
      );

      context.assert('stable left sibling preserves native identity', appRoot.children[0]?.id === stableLeftId);
      context.assert('stable right sibling preserves native identity', appRoot.children[7]?.id === stableRightId);
      const replayedStableSibling = transitionOperations.some(operation =>
        (operation.kind === 'insertNode' || operation.kind === 'removeNode') &&
        (operation.nodeId === stableLeftId || operation.nodeId === stableRightId),
      );
      context.assert('unaffected stable siblings are never structurally replayed', !replayedStableSibling);
      context.assert('native app root identity remains stable', host.root.children[0] === appRoot);
    } finally {
      dispose();
      resetNativeBridgeForTests();
    }
  },
};
