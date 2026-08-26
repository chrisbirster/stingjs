import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingNativeBridge,
} from '@stingjs/core';
import { Button, View } from '@stingjs/native';
import { renderApp } from '@stingjs/solid';
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
type MixedMode = 'alpha' | 'beta' | 'component' | 'gamma' | 'empty';

function createPortableFallbackBridge(): StingNativeBridge {
  return {
    getRuntimeInfo: () =>
      JSON.stringify({
        protocolVersion: STING_PROTOCOL_VERSION,
        platform: 'ios',
        modules: { Solid2Conformance: 'portable-fallback' },
      }),
    createElement() {},
    createTextNode() {},
    replaceText() {},
    setProperty() {},
    insertNode() {},
    removeNode() {},
    setEventEnabled() {},
    callModuleSync: () => JSON.stringify({ ok: true, value: null }),
  };
}

class RecordingBridge implements StingNativeBridge {
  private operations: Operation[] = [];
  private readonly alive = new Set<number>([0]);
  private readonly children = new Map<number, number[]>([[0, []]]);
  private readonly parent = new Map<number, number | null>([[0, null]]);

  constructor(readonly target: StingNativeBridge) {}

  take(): Operation[] {
    const operations = this.operations;
    this.operations = [];
    return operations;
  }

  isAlive(id: number): boolean {
    return this.alive.has(id);
  }

  attachedIds(): Set<number> {
    const attached = new Set<number>();
    const visit = (id: number): void => {
      attached.add(id);
      for (const child of this.children.get(id) ?? []) visit(child);
    };
    visit(0);
    return attached;
  }

  aliveIds(): Set<number> {
    return new Set(this.alive);
  }

  getRuntimeInfo(): string {
    return this.target.getRuntimeInfo();
  }

  createElement(id: number, type: string): void {
    this.assertNew(id);
    this.alive.add(id);
    this.children.set(id, []);
    this.parent.set(id, null);
    this.operations.push({ kind: 'createElement', id, type });
    this.target.createElement(id, type);
  }

  createTextNode(id: number, value: string): void {
    this.assertNew(id);
    this.alive.add(id);
    this.children.set(id, []);
    this.parent.set(id, null);
    this.operations.push({ kind: 'createTextNode', id, value });
    this.target.createTextNode(id, value);
  }

  replaceText(id: number, value: string): void {
    this.assertAlive(id, 'replaceText');
    this.operations.push({ kind: 'replaceText', id, value });
    this.target.replaceText(id, value);
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    this.assertAlive(id, 'setProperty');
    this.operations.push({ kind: 'setProperty', id, name, valueJSON });
    this.target.setProperty(id, name, valueJSON);
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.assertAlive(parentId, 'insertNode parent');
    this.assertAlive(nodeId, 'insertNode node');
    const targetChildren = this.children.get(parentId);
    if (!targetChildren) throw new Error(`Native shadow parent ${parentId} has no children`);

    if (anchorId !== -1) {
      this.assertAlive(anchorId, 'insertNode anchor');
      if (this.parent.get(anchorId) !== parentId) {
        throw new Error(`Native shadow anchor ${anchorId} is not under ${parentId}`);
      }
    }

    const oldParentId = this.parent.get(nodeId);
    if (oldParentId != null) {
      const oldChildren = this.children.get(oldParentId);
      const oldIndex = oldChildren?.indexOf(nodeId) ?? -1;
      if (oldChildren && oldIndex >= 0) oldChildren.splice(oldIndex, 1);
    }

    const anchorIndex = anchorId === -1 ? -1 : targetChildren.indexOf(anchorId);
    targetChildren.splice(anchorIndex >= 0 ? anchorIndex : targetChildren.length, 0, nodeId);
    this.parent.set(nodeId, parentId);
    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
    this.target.insertNode(parentId, nodeId, anchorId);
  }

  removeNode(parentId: number, nodeId: number): void {
    this.assertAlive(parentId, 'removeNode parent');
    this.assertAlive(nodeId, 'removeNode node');
    if (this.parent.get(nodeId) !== parentId) {
      throw new Error(`Native shadow node ${nodeId} is not under ${parentId}`);
    }
    const siblings = this.children.get(parentId);
    const index = siblings?.indexOf(nodeId) ?? -1;
    if (!siblings || index < 0) throw new Error(`Native shadow cannot remove ${nodeId}`);
    siblings.splice(index, 1);
    this.destroySubtree(nodeId);
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
    this.target.removeNode(parentId, nodeId);
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.assertAlive(id, 'setEventEnabled');
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
    this.target.setEventEnabled(id, event, enabled);
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    return this.target.callModuleSync(module, method, argsJSON);
  }

  private assertNew(id: number): void {
    if (id === 0 || this.alive.has(id)) throw new Error(`Duplicate native id ${id}`);
  }

  private assertAlive(id: number, operation: string): void {
    if (!this.alive.has(id)) throw new Error(`${operation} referenced retired native node ${id}`);
  }

  private destroySubtree(id: number): void {
    for (const child of [...(this.children.get(id) ?? [])]) this.destroySubtree(child);
    this.children.delete(id);
    this.parent.delete(id);
    this.alive.delete(id);
  }
}

function count(operations: readonly Operation[], kind: OperationKind): number {
  return operations.reduce((total, operation) => total + (operation.kind === kind ? 1 : 0), 0);
}

function trace(operations: readonly Operation[]): string {
  return operations
    .map(operation => {
      if (operation.kind === 'createElement') return `createElement(${operation.id},${operation.type})`;
      if (operation.kind === 'createTextNode') return `createTextNode(${operation.id},${JSON.stringify(operation.value)})`;
      if (operation.kind === 'replaceText') return `replaceText(${operation.id},${JSON.stringify(operation.value)})`;
      if (operation.kind === 'setProperty') return `setProperty(${operation.id},${operation.name})`;
      if (operation.kind === 'insertNode') return `insertNode(${operation.parentId},${operation.nodeId},${operation.anchorId})`;
      if (operation.kind === 'removeNode') return `removeNode(${operation.parentId},${operation.nodeId})`;
      return `setEventEnabled(${operation.id},${operation.event},${operation.enabled})`;
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
  context.assert(name, actual === expected, `expected=${expected} actual=${actual}: ${trace(operations)}`);
}

function assertNoStructuralReplay(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
): void {
  const structural =
    count(operations, 'createElement') +
    count(operations, 'createTextNode') +
    count(operations, 'insertNode') +
    count(operations, 'removeNode');
  context.assert(name, structural === 0, trace(operations));
}

function assertReplacementPair(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
  parentId: number,
  oldNodeId: number,
  newNodeId: number,
): void {
  const inserted = operations.some(
    operation =>
      operation.kind === 'insertNode' &&
      operation.parentId === parentId &&
      operation.nodeId === newNodeId,
  );
  const removed = operations.some(
    operation =>
      operation.kind === 'removeNode' &&
      operation.parentId === parentId &&
      operation.nodeId === oldNodeId,
  );
  context.assert(
    name,
    inserted && removed,
    `replacement must contain the expected insert/remove pair; ${trace(operations)}`,
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
      !operation.enabled,
  );
  const removeIndex = operations.findIndex(
    operation => operation.kind === 'removeNode' && operation.nodeId === removedNodeId,
  );
  context.assert(name, disableIndex >= 0 && removeIndex > disableIndex, trace(operations));
}

function collectHostIds(node: HostNode, target = new Set<number>()): Set<number> {
  target.add(node.id);
  for (const child of node.children) collectHostIds(child, target);
  return target;
}

function sameIds(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function formatIds(ids: ReadonlySet<number>): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

function assertTreeIntegrity(
  context: ScenarioContext,
  name: string,
  root: HostNode,
  bridge: RecordingBridge,
): void {
  const hostIds = collectHostIds(root);
  const attached = bridge.attachedIds();
  const alive = bridge.aliveIds();
  context.assert(
    `${name}: host/native attached ids match`,
    sameIds(hostIds, attached),
    `host=[${formatIds(hostIds)}] native=[${formatIds(attached)}]`,
  );
  context.assert(
    `${name}: no unattached ghost native nodes`,
    sameIds(attached, alive),
    `attached=[${formatIds(attached)}] alive=[${formatIds(alive)}]`,
  );
}

function touchesNode(operation: Operation, id: number): boolean {
  if (operation.kind === 'insertNode') {
    return operation.parentId === id || operation.nodeId === id || operation.anchorId === id;
  }
  if (operation.kind === 'removeNode') return operation.parentId === id || operation.nodeId === id;
  return operation.id === id;
}

function dispatchPress(id: number): void {
  const dispatch = globalThis.__stingDispatchEvent;
  if (!dispatch) throw new Error('Sting conformance event dispatcher is unavailable');
  dispatch(id, 'press', 'null');
}

function update(write: () => void): void {
  write();
  flush();
}

function throwsRemovedNode(action: () => void): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes('removed') && error.message.includes('cannot be reused');
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function recordLatencyMetrics(
  context: ScenarioContext,
  prefix: string,
  samples: readonly number[],
  unit: string,
): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);
  context.metric(`${prefix}.samples`, sorted.length, 'samples');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, unit);
  context.metric(`${prefix}.mean`, sorted.length ? total / sorted.length : 0, unit);
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), unit);
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), unit);
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), unit);
  context.metric(`${prefix}.max`, sorted.at(-1) ?? 0, unit);
}

export const scenario: ScenarioDefinition = {
  id: 'renderer',
  title: 'Sting universal renderer mutation, identity, move, and disposal torture',
  workstream: 'renderer',
  kind: 'hybrid',

  run(context) {
    const targetBridge = globalThis.__stingNativeBridge ?? createPortableFallbackBridge();
    const recording = new RecordingBridge(targetBridge);
    resetNativeBridgeForTests();
    const host = installNativeBridge(recording);

    const [mixedMode, setMixedMode] = createSignal<MixedMode>('alpha');
    const [deepVisible, setDeepVisible] = createSignal(true);
    const [propertyLabel, setPropertyLabel] = createSignal('label-0');
    const [cycleVisible, setCycleVisible] = createSignal(false);

    let mixedHits = 0;
    let deepHits = 0;
    let cycleHits = 0;
    let arrayAHits = 0;
    let arrayBHits = 0;
    let arrayCHits = 0;
    let arrayDHits = 0;

    const arrayA = host.createElement('button');
    const arrayB = host.createElement('button');
    const arrayC = host.createElement('button');
    host.setProperty(arrayA, 'onPress', () => arrayAHits++);
    host.setProperty(arrayB, 'onPress', () => arrayBHits++);
    host.setProperty(arrayC, 'onPress', () => arrayCHits++);
    const [arrayOrder, setArrayOrder] = createSignal<HostNode[]>([arrayA, arrayB, arrayC]);

    const mixedChild = (): HostNode | string | null => {
      const mode = mixedMode();
      if (mode === 'component') return Button({ onPress: () => mixedHits++ });
      if (mode === 'empty') return null;
      return mode;
    };

    const dispose = renderApp(() => (
      <View>
        <View />
        <View>{mixedChild()}</View>
        <View>{arrayOrder()}</View>
        <View>
          {deepVisible() ? (
            <View><View><View><Button onPress={() => deepHits++} /></View></View></View>
          ) : (
            <View />
          )}
        </View>
        <View accessibilityLabel={propertyLabel()} />
        <Button />
        <View>{cycleVisible() ? <Button onPress={() => cycleHits++} /> : null}</View>
        <View />
      </View>
    ));

    const allOperations: Operation[] = [];
    const capture = (): Operation[] => {
      const operations = recording.take();
      allOperations.push(...operations);
      return operations;
    };

    try {
      const appRoot = host.root.children[0];
      context.assert('renderer app mounts as one native root view', appRoot?.type === 'view');
      if (!appRoot) return;
      context.assert('renderer torture app has eight stable sections', appRoot.children.length === 8);

      const stableLeft = appRoot.children[0]!;
      const mixedSection = appRoot.children[1]!;
      const arraySection = appRoot.children[2]!;
      const deepSection = appRoot.children[3]!;
      const propertySection = appRoot.children[4]!;
      const eventButton = appRoot.children[5]!;
      const cycleSection = appRoot.children[6]!;
      const stableRight = appRoot.children[7]!;
      const stableLeftId = stableLeft.id;
      const stableRightId = stableRight.id;
      recording.take();
      assertTreeIntegrity(context, 'initial mount', host.root, recording);

      const initialText = mixedSection.children[0]!;
      update(() => setMixedMode('beta'));
      let operations = capture();
      context.assert('text -> text preserves native identity', mixedSection.children[0] === initialText);
      assertCount(context, 'text -> text emits one replaceText', operations, 'replaceText', 1);
      assertNoStructuralReplay(context, 'text -> text emits no structural replay', operations);

      update(() => setMixedMode('component'));
      operations = capture();
      const firstMixedButton = mixedSection.children[0]!;
      context.assert('text -> component mounts a button', firstMixedButton.type === 'button');
      assertCount(context, 'text -> component creates once', operations, 'createElement', 1);
      assertCount(context, 'text -> component inserts once', operations, 'insertNode', 1);
      assertCount(context, 'text -> component removes old text once', operations, 'removeNode', 1);
      assertCount(context, 'text -> component enables one event', operations, 'setEventEnabled', 1);
      assertReplacementPair(context, 'text -> component performs one replacement pair', operations, mixedSection.id, initialText.id, firstMixedButton.id);
      dispatchPress(firstMixedButton.id);
      context.assert('new component event is live', mixedHits === 1);

      const hitsBeforeRemoval = mixedHits;
      update(() => setMixedMode('gamma'));
      operations = capture();
      const gammaText = mixedSection.children[0]!;
      context.assert('component -> text mounts expected text', gammaText.isText && gammaText.textValue === 'gamma');
      assertCount(context, 'component -> text creates one text node', operations, 'createTextNode', 1);
      assertCount(context, 'component -> text removes one component', operations, 'removeNode', 1);
      assertCount(context, 'component -> text inserts one text', operations, 'insertNode', 1);
      assertEventDisabledBeforeRemoval(context, 'component -> text disables event before removal', operations, firstMixedButton.id, firstMixedButton.id);
      assertReplacementPair(context, 'component -> text performs expected replacement pair', operations, mixedSection.id, firstMixedButton.id, gammaText.id);
      dispatchPress(firstMixedButton.id);
      context.assert('removed component cannot receive stale callback', mixedHits === hitsBeforeRemoval);

      update(() => setMixedMode('empty'));
      operations = capture();
      context.assert('text -> null leaves section empty', mixedSection.children.length === 0);
      assertCount(context, 'text -> null removes exactly one node', operations, 'removeNode', 1);

      update(() => setMixedMode('component'));
      operations = capture();
      const secondMixedButton = mixedSection.children[0]!;
      assertCount(context, 'null -> component creates one element', operations, 'createElement', 1);
      assertCount(context, 'null -> component inserts one element', operations, 'insertNode', 1);
      const secondHits = mixedHits;
      update(() => setMixedMode('empty'));
      operations = capture();
      assertEventDisabledBeforeRemoval(context, 'component -> null disables event before removal', operations, secondMixedButton.id, secondMixedButton.id);
      dispatchPress(secondMixedButton.id);
      context.assert('component -> null leaves no stale callback', mixedHits === secondHits);
      assertTreeIntegrity(context, 'scalar replacement phase', host.root, recording);

      context.assert(
        'array starts with A/B/C identities',
        arraySection.children[0] === arrayA && arraySection.children[1] === arrayB && arraySection.children[2] === arrayC,
      );
      update(() => setArrayOrder([arrayC, arrayA, arrayB]));
      operations = capture();
      context.assert(
        'array reorder preserves C/A/B identities',
        arraySection.children[0] === arrayC && arraySection.children[1] === arrayA && arraySection.children[2] === arrayB,
      );
      assertCount(context, 'array reorder performs one move', operations, 'insertNode', 1);
      assertCount(context, 'array reorder creates nothing', operations, 'createElement', 0);
      assertCount(context, 'array reorder removes nothing', operations, 'removeNode', 0);
      update(() => setArrayOrder([arrayA, arrayB, arrayC]));
      operations = capture();
      assertCount(context, 'array move-back performs one move', operations, 'insertNode', 1);
      assertCount(context, 'array move-back removes nothing', operations, 'removeNode', 0);

      const arrayD = host.createElement('button');
      host.setProperty(arrayD, 'onPress', () => arrayDHits++);
      capture();
      const cHits = arrayCHits;
      update(() => setArrayOrder([arrayA, arrayB, arrayD]));
      operations = capture();
      context.assert(
        'array replacement preserves A/B and installs D',
        arraySection.children[0] === arrayA && arraySection.children[1] === arrayB && arraySection.children[2] === arrayD,
      );
      assertCount(context, 'array replacement inserts once', operations, 'insertNode', 1);
      assertCount(context, 'array replacement removes once', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(context, 'array replacement disables removed event first', operations, arrayC.id, arrayC.id);
      assertReplacementPair(context, 'array replacement contains expected insert/remove pair', operations, arraySection.id, arrayC.id, arrayD.id);
      dispatchPress(arrayC.id);
      context.assert('removed array node has no stale event', arrayCHits === cHits);

      const firstDeepRoot = deepSection.children[0]!;
      const firstDeepButton = firstDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('deep subtree exposes eventful descendant', firstDeepButton?.type === 'button');
      if (!firstDeepButton) return;
      const retiredDeepIds = collectHostIds(firstDeepRoot);
      dispatchPress(firstDeepButton.id);
      context.assert('deep descendant event starts live', deepHits === 1);
      const deepHitsBeforeRemoval = deepHits;
      update(() => setDeepVisible(false));
      operations = capture();
      const deepFallback = deepSection.children[0]!;
      assertCount(context, 'deep replacement creates fallback root once', operations, 'createElement', 1);
      assertCount(context, 'deep replacement removes old parent once', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(context, 'deep descendant event disables before parent removal', operations, firstDeepButton.id, firstDeepRoot.id);
      assertReplacementPair(context, 'deep replacement contains expected pair', operations, deepSection.id, firstDeepRoot.id, deepFallback.id);
      for (const id of retiredDeepIds) context.assert(`deep removal retires native id ${id}`, !recording.isAlive(id));
      dispatchPress(firstDeepButton.id);
      context.assert('deep removal leaves no stale descendant callback', deepHits === deepHitsBeforeRemoval);
      context.assert('deep removed parent rejects resurrection', throwsRemovedNode(() => host.insertNode(deepSection, firstDeepRoot)));

      update(() => setDeepVisible(true));
      operations = capture();
      const secondDeepRoot = deepSection.children[0]!;
      const secondDeepButton = secondDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('deep remount gets fresh root identity', secondDeepRoot.id !== firstDeepRoot.id);
      context.assert('deep remount gets fresh descendant identity', secondDeepButton != null && secondDeepButton.id !== firstDeepButton.id);
      assertCount(context, 'deep remount creates four elements', operations, 'createElement', 4);
      assertCount(context, 'deep remount removes fallback once', operations, 'removeNode', 1);
      assertTreeIntegrity(context, 'deep replacement phase', host.root, recording);

      update(() => setPropertyLabel('label-0'));
      context.assert('equal signal property emits nothing', capture().length === 0);
      host.setProperty(propertySection, 'accessibilityLabel', 'label-0');
      host.setProperty(propertySection, 'accessibilityLabel', 'label-0');
      context.assert('identical direct property writes dedupe', capture().length === 0);
      host.setProperty(propertySection, 'style', { padding: 7 });
      host.setProperty(propertySection, 'style', { padding: 7 });
      operations = capture();
      assertCount(context, 'serialized object property writes dedupe', operations, 'setProperty', 1);
      assertNoStructuralReplay(context, 'property writes replay no structure', operations);

      const propertySamples: number[] = [];
      const propertyOps: Operation[] = [];
      for (let index = 1; index <= 64; index++) {
        const start = context.now();
        update(() => setPropertyLabel(`label-${index}`));
        propertySamples.push(context.now() - start);
        const sample = capture();
        propertyOps.push(...sample);
        assertCount(context, `property sample ${index} emits one setProperty`, sample, 'setProperty', 1);
        assertNoStructuralReplay(context, `property sample ${index} preserves structure`, sample);
      }
      recordLatencyMetrics(context, 'rapid-property', propertySamples, 'ms/update');
      context.metric('rapid-property.native.setProperty', count(propertyOps, 'setProperty'), 'mutations');

      let handlerAHits = 0;
      let handlerBHits = 0;
      const handlerA = (): void => void handlerAHits++;
      const handlerB = (): void => void handlerBHits++;
      host.setProperty(eventButton, 'onPress', handlerA);
      operations = capture();
      assertCount(context, 'first handler enables event once', operations, 'setEventEnabled', 1);
      host.setProperty(eventButton, 'onPress', handlerB);
      context.assert('handler replacement is JS-only while enabled', capture().length === 0);
      dispatchPress(eventButton.id);
      context.assert('handler replacement stops old callback', handlerAHits === 0);
      context.assert('handler replacement calls latest callback', handlerBHits === 1);
      host.setProperty(eventButton, 'onPress', null);
      operations = capture();
      assertCount(context, 'event removal disables once', operations, 'setEventEnabled', 1);
      dispatchPress(eventButton.id);
      context.assert('removed handler cannot fire', handlerBHits === 1);
      host.setProperty(eventButton, 'onPress', handlerA);
      capture();

      const reorderSamples: number[] = [];
      const reorderOps: Operation[] = [];
      for (let index = 0; index < 64; index++) {
        const start = context.now();
        update(() => setArrayOrder(index % 2 === 0 ? [arrayD, arrayA, arrayB] : [arrayA, arrayB, arrayD]));
        reorderSamples.push(context.now() - start);
        const sample = capture();
        reorderOps.push(...sample);
        assertCount(context, `reorder sample ${index + 1} moves once`, sample, 'insertNode', 1);
        assertCount(context, `reorder sample ${index + 1} creates nothing`, sample, 'createElement', 0);
        assertCount(context, `reorder sample ${index + 1} removes nothing`, sample, 'removeNode', 0);
        context.assert(
          `reorder sample ${index + 1} keeps parent bookkeeping valid`,
          arraySection.children.length === 3 && arraySection.children.every(child => host.getParentNode(child) === arraySection),
        );
      }
      recordLatencyMetrics(context, 'array-reorder', reorderSamples, 'ms/reorder');
      context.metric('array-reorder.native.insertNode', count(reorderOps, 'insertNode'), 'mutations');

      const cycleSamples: number[] = [];
      const cycleOps: Operation[] = [];
      let previousCycleId = -1;
      for (let index = 0; index < 64; index++) {
        const start = context.now();
        update(() => setCycleVisible(true));
        const mounted = cycleSection.children[0];
        context.assert(`cycle ${index + 1} mounts a button`, mounted?.type === 'button');
        if (!mounted) return;
        context.assert(`cycle ${index + 1} gets fresh identity`, mounted.id !== previousCycleId);
        const id = mounted.id;
        previousCycleId = id;
        let sample = capture();
        cycleOps.push(...sample);
        assertCount(context, `cycle ${index + 1} mount creates once`, sample, 'createElement', 1);
        assertCount(context, `cycle ${index + 1} mount inserts once`, sample, 'insertNode', 1);
        dispatchPress(id);
        const hits = cycleHits;
        update(() => setCycleVisible(false));
        sample = capture();
        cycleOps.push(...sample);
        assertCount(context, `cycle ${index + 1} unmount removes once`, sample, 'removeNode', 1);
        assertEventDisabledBeforeRemoval(context, `cycle ${index + 1} disables event first`, sample, id, id);
        context.assert(`cycle ${index + 1} retires identity`, !recording.isAlive(id));
        dispatchPress(id);
        context.assert(`cycle ${index + 1} leaves no stale callback`, cycleHits === hits);
        assertTreeIntegrity(context, `cycle ${index + 1}`, host.root, recording);
        cycleSamples.push(context.now() - start);
      }
      recordLatencyMetrics(context, 'mount-remove', cycleSamples, 'ms/cycle');
      context.metric('mount-remove.native.createElement', count(cycleOps, 'createElement'), 'mutations');
      context.metric('mount-remove.native.removeNode', count(cycleOps, 'removeNode'), 'mutations');
      context.metric('mount-remove.native.setEventEnabled', count(cycleOps, 'setEventEnabled'), 'mutations');

      context.assert('left sentinel preserves identity', appRoot.children[0] === stableLeft && stableLeft.id === stableLeftId);
      context.assert('right sentinel preserves identity', appRoot.children[7] === stableRight && stableRight.id === stableRightId);
      context.assert('left sentinel receives no unrelated mutation', !allOperations.some(operation => touchesNode(operation, stableLeftId)));
      context.assert('right sentinel receives no unrelated mutation', !allOperations.some(operation => touchesNode(operation, stableRightId)));

      dispatchPress(arrayA.id);
      dispatchPress(arrayB.id);
      dispatchPress(arrayD.id);
      context.assert('array A event survives reorder stress', arrayAHits === 1);
      context.assert('array B event survives reorder stress', arrayBHits === 1);
      context.assert('array D event survives reorder stress', arrayDHits === 1);
      assertTreeIntegrity(context, 'final steady state', host.root, recording);
    } finally {
      dispose();
      resetNativeBridgeForTests();
    }
  },
};
