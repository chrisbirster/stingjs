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
  let total = 0;
  for (const operation of operations) {
    if (operation.kind === kind) total++;
  }
  return total;
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

function assertCount(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
  kind: OperationKind,
  expected: number,
): void {
  const actual = count(operations, kind);
  context.assert(name, actual === expected, `expected ${expected}, got ${actual}: ${trace(operations)}`);
}

function assertReplacementOrder(
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
    `replacement must insert before remove: ${trace(operations)}`,
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

function addRetiredSubtree(retired: Set<number>, node: HostNode): void {
  for (const id of collectSubtreeIds(node)) retired.add(id);
}

function dispatchPress(nodeId: number): void {
  const dispatch = globalThis.__stingDispatchEvent;
  if (!dispatch) throw new Error('Sting conformance event dispatcher is unavailable');
  dispatch(nodeId, 'press', 'null');
}

function percentile(sortedSamples: readonly number[], percentileValue: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(sortedSamples.length * percentileValue) - 1),
  );
  return sortedSamples[index] ?? 0;
}

function recordLatencyMetrics(context: ScenarioContext, samples: readonly number[]): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const mean = sorted.length === 0 ? 0 : total / sorted.length;

  context.metric('rapid-branch.samples', sorted.length, 'samples');
  context.metric('rapid-branch.min', sorted[0] ?? 0, 'ms/toggle');
  context.metric('rapid-branch.mean', mean, 'ms/toggle');
  context.metric('rapid-branch.p50', percentile(sorted, 0.5), 'ms/toggle');
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
    const targetBridge = nativeBridge ?? createPortableFallbackBridge();
    const recording = new RecordingBridge(targetBridge);

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

    const DynamicA: NativeComponent = () => (
      <Button onPress={() => dynamicAHits++} />
    );
    const DynamicB: NativeComponent = () => (
      <Button onPress={() => dynamicBHits++} />
    );
    const [dynamicSelection, setDynamicSelection] = createSignal<DynamicSelection>(DynamicA);

    const NestedLive: NativeComponent = () => (
      <View>
        <Button onPress={() => nestedHits++} />
      </View>
    );
    const NestedInnerFallback: NativeComponent = () => (
      <View>
        <Button onPress={() => nestedHits++} />
      </View>
    );
    const NestedOuterFallback: NativeComponent = () => (
      <View>
        <Button onPress={() => nestedHits++} />
      </View>
    );

    const StressOn: NativeComponent = () => <Button onPress={() => stressHits++} />;
    const StressOff: NativeComponent = () => <Button onPress={() => stressHits++} />;

    const dispose = renderApp(() => (
      <View>
        <View />

        <View>
          <Show when={showValue()} fallback={<Button />}>
            {value => (
              <Button
                onPress={() => {
                  showHits++;
                  showObserved = value();
                }}
              />
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
                <Button
                  onPress={() => {
                    switchHits++;
                    switchObserved = value();
                  }}
                />
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
        'all control-flow sections mounted under the stable root',
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

      // <Show>: truthy -> truthy keeps native identity while the narrowed accessor
      // observes the newest condition value.
      const initialShowNode = showSection.children[0]!;
      dispatchPress(initialShowNode.id);
      context.assert('Show child event is live before transition', showHits === 1);
      context.assert('Show narrowed accessor starts at alpha', showObserved === 'alpha');

      update(() => setShowValue('beta'));
      let operations = capture();
      context.assert(
        'Show preserves native identity across truthy value changes',
        showSection.children[0] === initialShowNode,
      );
      context.assert(
        'Show truthy-to-truthy causes zero native replay',
        operations.length === 0,
        trace(operations),
      );
      dispatchPress(initialShowNode.id);
      context.assert('Show narrowed accessor observes current truthy value', showObserved === 'beta');

      addRetiredSubtree(retiredIds, initialShowNode);
      const showHitsBeforeRemoval = showHits;
      update(() => setShowValue(null));
      operations = capture();
      const showFallback = showSection.children[0]!;
      assertCount(context, 'Show off creates exactly one replacement element', operations, 'createElement', 1);
      assertCount(context, 'Show off inserts exactly one replacement', operations, 'insertNode', 1);
      assertCount(context, 'Show off removes exactly one old branch', operations, 'removeNode', 1);
      assertCount(context, 'Show off does not create text nodes', operations, 'createTextNode', 0);
      assertCount(context, 'Show off does not replay ordinary properties', operations, 'setProperty', 0);
      assertReplacementOrder(
        context,
        'Show replacement inserts before removal',
        operations,
        showSection.id,
        initialShowNode.id,
        showFallback.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'Show removed branch tears down its event before removal',
        operations,
        initialShowNode.id,
        initialShowNode.id,
      );
      dispatchPress(initialShowNode.id);
      context.assert('Show removed branch cannot receive stale events', showHits === showHitsBeforeRemoval);

      addRetiredSubtree(retiredIds, showFallback);
      update(() => setShowValue('gamma'));
      operations = capture();
      const remountedShow = showSection.children[0]!;
      context.assert('Show remount receives a new native identity', remountedShow.id !== initialShowNode.id);
      assertCount(context, 'Show remount creates exactly one element', operations, 'createElement', 1);
      assertCount(context, 'Show remount inserts exactly once', operations, 'insertNode', 1);
      assertCount(context, 'Show remount removes fallback exactly once', operations, 'removeNode', 1);
      assertReplacementOrder(
        context,
        'Show remount replacement ordering is stable',
        operations,
        showSection.id,
        showFallback.id,
        remountedShow.id,
      );

      // Nested <Show>: replace a two-node subtree and prove descendant event
      // handlers are torn down even though native removal only targets its root.
      const initialNestedRoot = nestedSection.children[0]!;
      const initialNestedButton = initialNestedRoot.children[0]!;
      addRetiredSubtree(retiredIds, initialNestedRoot);
      const nestedHitsBeforeRemoval = nestedHits;
      update(() => setInnerVisible(false));
      operations = capture();
      const innerFallbackRoot = nestedSection.children[0]!;
      assertCount(context, 'nested Show creates exactly two native elements', operations, 'createElement', 2);
      assertCount(context, 'nested Show inserts child and subtree root exactly once each', operations, 'insertNode', 2);
      assertCount(context, 'nested Show removes only the old subtree root', operations, 'removeNode', 1);
      assertCount(context, 'nested Show creates no text nodes', operations, 'createTextNode', 0);
      assertCount(context, 'nested Show replays no ordinary properties', operations, 'setProperty', 0);
      assertReplacementOrder(
        context,
        'nested Show inserts replacement subtree before removing old root',
        operations,
        nestedSection.id,
        initialNestedRoot.id,
        innerFallbackRoot.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'nested Show disables descendant event before parent subtree removal',
        operations,
        initialNestedButton.id,
        initialNestedRoot.id,
      );
      dispatchPress(initialNestedButton.id);
      context.assert('nested removed descendant cannot receive stale events', nestedHits === nestedHitsBeforeRemoval);

      const innerFallbackButton = innerFallbackRoot.children[0]!;
      addRetiredSubtree(retiredIds, innerFallbackRoot);
      update(() => setOuterVisible(false));
      operations = capture();
      const outerFallbackRoot = nestedSection.children[0]!;
      assertCount(context, 'outer Show replacement creates exactly two elements', operations, 'createElement', 2);
      assertCount(context, 'outer Show replacement inserts exactly twice', operations, 'insertNode', 2);
      assertCount(context, 'outer Show replacement removes one subtree root', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(
        context,
        'outer Show tears down nested descendant event before parent removal',
        operations,
        innerFallbackButton.id,
        innerFallbackRoot.id,
      );

      addRetiredSubtree(retiredIds, outerFallbackRoot);
      update(() => setOuterVisible(true));
      capture();
      update(() => setInnerVisible(true));
      capture();
      context.assert('nested conditional subtree returns to exactly one live root', nestedSection.children.length === 1);

      // <Switch>/<Match>: selected Match stays mounted while its truthy payload
      // changes, then is replaced atomically when another Match wins.
      const firstMatchNode = switchSection.children[0]!;
      update(() => setMatchPayload('match-b'));
      operations = capture();
      context.assert('Match preserves native identity while it remains selected', switchSection.children[0] === firstMatchNode);
      context.assert('Match payload-only change causes zero native replay', operations.length === 0, trace(operations));
      dispatchPress(firstMatchNode.id);
      context.assert('Match narrowed accessor observes current payload', switchObserved === 'match-b');

      addRetiredSubtree(retiredIds, firstMatchNode);
      const switchHitsBeforeRemoval = switchHits;
      update(() => setRoute('two'));
      operations = capture();
      const secondMatchNode = switchSection.children[0]!;
      assertCount(context, 'Switch Match replacement creates one element', operations, 'createElement', 1);
      assertCount(context, 'Switch Match replacement inserts once', operations, 'insertNode', 1);
      assertCount(context, 'Switch Match replacement removes once', operations, 'removeNode', 1);
      assertReplacementOrder(
        context,
        'Switch Match replacement inserts before removal',
        operations,
        switchSection.id,
        firstMatchNode.id,
        secondMatchNode.id,
      );
      assertEventDisabledBeforeRemoval(
        context,
        'Switch Match removed handler is disabled before removal',
        operations,
        firstMatchNode.id,
        firstMatchNode.id,
      );
      dispatchPress(firstMatchNode.id);
      context.assert('removed Match cannot receive stale events', switchHits === switchHitsBeforeRemoval);

      addRetiredSubtree(retiredIds, secondMatchNode);
      update(() => setRoute('none'));
      capture();
      context.assert('Switch fallback leaves exactly one native branch', switchSection.children.length === 1);

      // <Dynamic>: native component -> component -> intrinsic -> null -> component.
      const dynamicA = dynamicSection.children[0]!;
      addRetiredSubtree(retiredIds, dynamicA);
      const dynamicAHitsBeforeRemoval = dynamicAHits;
      update(() => setDynamicSelection(() => DynamicB));
      operations = capture();
      const dynamicB = dynamicSection.children[0]!;
      assertCount(context, 'Dynamic component replacement creates one element', operations, 'createElement', 1);
      assertCount(context, 'Dynamic component replacement inserts once', operations, 'insertNode', 1);
      assertCount(context, 'Dynamic component replacement removes once', operations, 'removeNode', 1);
      assertReplacementOrder(
        context,
        'Dynamic component replacement inserts before removal',
        operations,
        dynamicSection.id,
        dynamicA.id,
        dynamicB.id,
      );
      dispatchPress(dynamicA.id);
      context.assert('Dynamic removed component handler is stale-safe', dynamicAHits === dynamicAHitsBeforeRemoval);

      addRetiredSubtree(retiredIds, dynamicB);
      const dynamicBHitsBeforeRemoval = dynamicBHits;
      update(() => setDynamicSelection('view'));
      operations = capture();
      const dynamicIntrinsic = dynamicSection.children[0]!;
      context.assert('Dynamic supports Sting native intrinsic selection without DOM', dynamicIntrinsic.type === 'view');
      assertCount(context, 'Dynamic intrinsic transition creates one native element', operations, 'createElement', 1);
      assertCount(context, 'Dynamic intrinsic transition inserts once', operations, 'insertNode', 1);
      assertCount(context, 'Dynamic intrinsic transition removes once', operations, 'removeNode', 1);
      dispatchPress(dynamicB.id);
      context.assert('Dynamic replaced component handler is removed', dynamicBHits === dynamicBHitsBeforeRemoval);

      addRetiredSubtree(retiredIds, dynamicIntrinsic);
      update(() => setDynamicSelection(undefined));
      operations = capture();
      context.assert('Dynamic component-to-null leaves no ghost node', dynamicSection.children.length === 0);
      assertCount(context, 'Dynamic component-to-null creates no nodes', operations, 'createElement', 0);
      assertCount(context, 'Dynamic component-to-null inserts no nodes', operations, 'insertNode', 0);
      assertCount(context, 'Dynamic component-to-null removes exactly one node', operations, 'removeNode', 1);

      update(() => setDynamicSelection(() => DynamicA));
      operations = capture();
      const remountedDynamicA = dynamicSection.children[0]!;
      context.assert('Dynamic null-to-component mounts one native node', dynamicSection.children.length === 1);
      assertCount(context, 'Dynamic null-to-component creates exactly one element', operations, 'createElement', 1);
      assertCount(context, 'Dynamic null-to-component inserts exactly once', operations, 'insertNode', 1);
      assertCount(context, 'Dynamic null-to-component removes nothing', operations, 'removeNode', 0);
      context.assert('Dynamic null-to-component receives fresh identity', remountedDynamicA.id !== dynamicA.id);

      // Raw text <-> component replacement exercises universal insertExpression
      // without routing text through Sting's Text component special case.
      const initialTextNode = textSection.children[0]!;
      context.assert('text/component lane starts as a raw native text node', initialTextNode.type === '#text');
      addRetiredSubtree(retiredIds, initialTextNode);
      update(() => setTextAsComponent(true));
      operations = capture();
      const textBranchButton = textSection.children[0]!;
      assertCount(context, 'text-to-component creates one element', operations, 'createElement', 1);
      assertCount(context, 'text-to-component creates no extra text', operations, 'createTextNode', 0);
      assertCount(context, 'text-to-component inserts once', operations, 'insertNode', 1);
      assertCount(context, 'text-to-component removes once', operations, 'removeNode', 1);
      assertReplacementOrder(
        context,
        'text-to-component inserts before removing text',
        operations,
        textSection.id,
        initialTextNode.id,
        textBranchButton.id,
      );

      addRetiredSubtree(retiredIds, textBranchButton);
      update(() => setTextAsComponent(false));
      operations = capture();
      const replacementTextNode = textSection.children[0]!;
      context.assert('component-to-text restores raw native text', replacementTextNode.type === '#text');
      assertCount(context, 'component-to-text creates exactly one text node', operations, 'createTextNode', 1);
      assertCount(context, 'component-to-text creates no element', operations, 'createElement', 0);
      assertCount(context, 'component-to-text inserts once', operations, 'insertNode', 1);
      assertCount(context, 'component-to-text removes once', operations, 'removeNode', 1);
      assertCount(context, 'component-to-text does not use replaceText for branch replacement', operations, 'replaceText', 0);
      assertReplacementOrder(
        context,
        'component-to-text inserts before removing component',
        operations,
        textSection.id,
        textBranchButton.id,
        replacementTextNode.id,
      );

      // Rapid changes: measure per-toggle latency in deterministic synchronous
      // batches and require exactly one create/insert/remove pair per branch swap.
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
      context.metric('rapid-branch.native.createElement', count(stressOperations, 'createElement'), 'mutations');
      context.metric('rapid-branch.native.createTextNode', count(stressOperations, 'createTextNode'), 'mutations');
      context.metric('rapid-branch.native.replaceText', count(stressOperations, 'replaceText'), 'mutations');
      context.metric('rapid-branch.native.setProperty', count(stressOperations, 'setProperty'), 'mutations');
      context.metric('rapid-branch.native.insertNode', count(stressOperations, 'insertNode'), 'mutations');
      context.metric('rapid-branch.native.removeNode', count(stressOperations, 'removeNode'), 'mutations');
      context.metric('rapid-branch.native.setEventEnabled', count(stressOperations, 'setEventEnabled'), 'mutations');
      context.metric('native-bridge-forwarded', nativeBridge ? 1 : 0, 'boolean');

      assertCount(context, 'rapid swaps create exactly one element per toggle', stressOperations, 'createElement', totalToggles);
      assertCount(context, 'rapid swaps create zero text nodes', stressOperations, 'createTextNode', 0);
      assertCount(context, 'rapid swaps perform zero replaceText calls', stressOperations, 'replaceText', 0);
      assertCount(context, 'rapid swaps replay zero ordinary properties', stressOperations, 'setProperty', 0);
      assertCount(context, 'rapid swaps insert exactly once per toggle', stressOperations, 'insertNode', totalToggles);
      assertCount(context, 'rapid swaps remove exactly once per toggle', stressOperations, 'removeNode', totalToggles);
      assertCount(
        context,
        'rapid swaps enable new and disable old handler exactly once per toggle',
        stressOperations,
        'setEventEnabled',
        totalToggles * 2,
      );
      context.assert('rapid swaps leave exactly one live branch', stressSection.children.length === 1);

      const eventTotalBeforeStaleDispatch =
        showHits + nestedHits + switchHits + dynamicAHits + dynamicBHits + stressHits;
      for (const nodeId of retiredStressIds) dispatchPress(nodeId);
      const eventTotalAfterStaleDispatch =
        showHits + nestedHits + switchHits + dynamicAHits + dynamicBHits + stressHits;
      context.assert(
        '1,000 retired rapid-swap node ids cannot dispatch stale handlers',
        eventTotalAfterStaleDispatch === eventTotalBeforeStaleDispatch,
      );

      const reachableIds = collectSubtreeIds(host.root);
      let ghostId: number | undefined;
      for (const retiredId of retiredIds) {
        if (reachableIds.has(retiredId)) {
          ghostId = retiredId;
          break;
        }
      }
      context.assert(
        'all retired conditional nodes and descendants are absent from the live shadow tree',
        ghostId === undefined,
        ghostId === undefined ? undefined : `retired node ${ghostId} is still reachable`,
      );

      context.assert('stable left sibling preserves native identity', appRoot.children[0]?.id === stableLeftId);
      context.assert('stable right sibling preserves native identity', appRoot.children[7]?.id === stableRightId);
      const stableSiblingReplay = transitionOperations.some(operation => {
        if (operation.kind === 'removeNode') {
          return operation.nodeId === stableLeftId || operation.nodeId === stableRightId;
        }
        if (operation.kind === 'insertNode') {
          return operation.nodeId === stableLeftId || operation.nodeId === stableRightId;
        }
        return false;
      });
      context.assert('unaffected native siblings are never reinserted or removed', !stableSiblingReplay);

      // When this bundle is running in JSC/UIKit, RecordingBridge forwards every
      // asserted mutation to the actual native bridge. Portable engines use the
      // same deterministic operation stream through their host bridge/fallback.
      context.assert(
        'native root identity remains stable across all control-flow mutations',
        host.root.children[0] === appRoot,
      );
    } finally {
      dispose();
      resetNativeBridgeForTests();
    }
  },
};
