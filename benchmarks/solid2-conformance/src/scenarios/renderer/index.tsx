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

/**
 * Mirrors the real native registries: removeNode detaches an identity but does
 * not destroy it. Solid's keyed reconciler may legally detach and later reinsert
 * the same HostNode during a move. Connectivity and event dispatch are what
 * disappear on detach; registration survives for the runtime lifetime.
 */
class RecordingBridge implements StingNativeBridge {
  private operations: Operation[] = [];
  private readonly registered = new Set<number>([0]);
  private readonly children = new Map<number, number[]>([[0, []]]);
  private readonly parent = new Map<number, number | null>([[0, null]]);

  constructor(readonly target: StingNativeBridge) {}

  take(): Operation[] {
    const taken = this.operations;
    this.operations = [];
    return taken;
  }

  isRegistered(id: number): boolean {
    return this.registered.has(id);
  }

  attachedIds(): Set<number> {
    const attached = new Set<number>();
    const visit = (id: number): void => {
      if (attached.has(id)) return;
      attached.add(id);
      for (const child of this.children.get(id) ?? []) visit(child);
    };
    visit(0);
    return attached;
  }

  registeredIds(): Set<number> {
    return new Set(this.registered);
  }

  validateAttachedTree(): { valid: boolean; detail: string } {
    const seen = new Set<number>();
    let detail = 'ok';

    const visit = (parentId: number): boolean => {
      const siblings = this.children.get(parentId) ?? [];
      const siblingSet = new Set<number>();
      for (const childId of siblings) {
        if (siblingSet.has(childId)) {
          detail = `duplicate child ${childId} under ${parentId}`;
          return false;
        }
        siblingSet.add(childId);
        if (!this.registered.has(childId)) {
          detail = `unregistered child ${childId} under ${parentId}`;
          return false;
        }
        if (this.parent.get(childId) !== parentId) {
          detail = `parent mismatch for ${childId}: ${String(this.parent.get(childId))}`;
          return false;
        }
        if (seen.has(childId)) {
          detail = `attached node ${childId} appears more than once`;
          return false;
        }
        seen.add(childId);
        if (!visit(childId)) return false;
      }
      return true;
    };

    return { valid: visit(0), detail };
  }

  getRuntimeInfo(): string {
    return this.target.getRuntimeInfo();
  }

  createElement(id: number, type: string): void {
    this.assertNew(id);
    this.registered.add(id);
    this.children.set(id, []);
    this.parent.set(id, null);
    this.operations.push({ kind: 'createElement', id, type });
    this.target.createElement(id, type);
  }

  createTextNode(id: number, value: string): void {
    this.assertNew(id);
    this.registered.add(id);
    this.children.set(id, []);
    this.parent.set(id, null);
    this.operations.push({ kind: 'createTextNode', id, value });
    this.target.createTextNode(id, value);
  }

  replaceText(id: number, value: string): void {
    this.assertRegistered(id, 'replaceText');
    this.operations.push({ kind: 'replaceText', id, value });
    this.target.replaceText(id, value);
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    this.assertRegistered(id, 'setProperty');
    this.operations.push({ kind: 'setProperty', id, name, valueJSON });
    this.target.setProperty(id, name, valueJSON);
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.assertRegistered(parentId, 'insertNode parent');
    this.assertRegistered(nodeId, 'insertNode node');

    const targetChildren = this.children.get(parentId);
    if (!targetChildren) throw new Error(`Native shadow parent ${parentId} has no child list`);

    if (anchorId !== -1) {
      this.assertRegistered(anchorId, 'insertNode anchor');
      if (this.parent.get(anchorId) !== parentId) {
        throw new Error(`Native shadow anchor ${anchorId} is not under parent ${parentId}`);
      }
    }

    const oldParentId = this.parent.get(nodeId);
    if (oldParentId != null) {
      const oldChildren = this.children.get(oldParentId);
      const oldIndex = oldChildren?.indexOf(nodeId) ?? -1;
      if (oldChildren && oldIndex >= 0) oldChildren.splice(oldIndex, 1);
    }

    const anchorIndex = anchorId === -1 ? -1 : targetChildren.indexOf(anchorId);
    const insertionIndex = anchorIndex >= 0 ? anchorIndex : targetChildren.length;
    targetChildren.splice(insertionIndex, 0, nodeId);
    this.parent.set(nodeId, parentId);

    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
    this.target.insertNode(parentId, nodeId, anchorId);
  }

  removeNode(parentId: number, nodeId: number): void {
    this.assertRegistered(parentId, 'removeNode parent');
    this.assertRegistered(nodeId, 'removeNode node');
    if (this.parent.get(nodeId) !== parentId) {
      throw new Error(`Native shadow node ${nodeId} is not under parent ${parentId}`);
    }

    const siblings = this.children.get(parentId);
    const index = siblings?.indexOf(nodeId) ?? -1;
    if (!siblings || index < 0) {
      throw new Error(`Native shadow cannot find child ${nodeId} under parent ${parentId}`);
    }

    siblings.splice(index, 1);
    this.parent.set(nodeId, null);
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
    this.target.removeNode(parentId, nodeId);
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.assertRegistered(id, 'setEventEnabled');
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
    this.target.setEventEnabled(id, event, enabled);
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    return this.target.callModuleSync(module, method, argsJSON);
  }

  private assertNew(id: number): void {
    if (id === 0 || this.registered.has(id)) {
      throw new Error(`Native shadow received duplicate node id ${id}`);
    }
  }

  private assertRegistered(id: number, operation: string): void {
    if (!this.registered.has(id)) {
      throw new Error(`${operation} referenced unknown native node ${id}`);
    }
  }
}

function count(operations: readonly Operation[], kind: OperationKind): number {
  return operations.reduce((total, operation) => total + (operation.kind === kind ? 1 : 0), 0);
}

function trace(operations: readonly Operation[]): string {
  return operations
    .map(operation => {
      switch (operation.kind) {
        case 'createElement': return `createElement(${operation.id},${operation.type})`;
        case 'createTextNode': return `createTextNode(${operation.id},${JSON.stringify(operation.value)})`;
        case 'replaceText': return `replaceText(${operation.id},${JSON.stringify(operation.value)})`;
        case 'setProperty': return `setProperty(${operation.id},${operation.name},${operation.valueJSON})`;
        case 'insertNode': return `insertNode(${operation.parentId},${operation.nodeId},${operation.anchorId})`;
        case 'removeNode': return `removeNode(${operation.parentId},${operation.nodeId})`;
        case 'setEventEnabled': return `setEventEnabled(${operation.id},${operation.event},${operation.enabled})`;
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

function assertNoStructure(
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
    `event teardown must precede native detach: ${trace(operations)}`,
  );
}

function assertMoveDetachesAreReinserted(
  context: ScenarioContext,
  name: string,
  operations: readonly Operation[],
): void {
  const insertedIds = new Set(
    operations
      .filter((operation): operation is Extract<Operation, { kind: 'insertNode' }> => operation.kind === 'insertNode')
      .map(operation => operation.nodeId),
  );
  const detachedIds = operations
    .filter((operation): operation is Extract<Operation, { kind: 'removeNode' }> => operation.kind === 'removeNode')
    .map(operation => operation.nodeId);
  context.assert(
    name,
    detachedIds.every(id => insertedIds.has(id)),
    `every detached keyed identity must be reinserted in the same move: ${trace(operations)}`,
  );
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
  return [...ids].sort((left, right) => left - right).join(',');
}

function assertTreeIntegrity(
  context: ScenarioContext,
  name: string,
  hostRoot: HostNode,
  recording: RecordingBridge,
): void {
  const hostIds = collectHostIds(hostRoot);
  const attached = recording.attachedIds();
  const registered = recording.registeredIds();
  const validation = recording.validateAttachedTree();

  context.assert(
    `${name}: host/native attached ids match`,
    sameIds(hostIds, attached),
    `host=[${formatIds(hostIds)}] native=[${formatIds(attached)}]`,
  );
  context.assert(`${name}: attached tree bookkeeping is coherent`, validation.valid, validation.detail);
  context.assert(
    `${name}: every attached id is registered`,
    [...attached].every(id => registered.has(id)),
  );
}

function touchesNode(operation: Operation, id: number): boolean {
  switch (operation.kind) {
    case 'createElement':
    case 'createTextNode':
    case 'replaceText':
    case 'setProperty':
    case 'setEventEnabled':
      return operation.id === id;
    case 'insertNode':
      return operation.parentId === id || operation.nodeId === id || operation.anchorId === id;
    case 'removeNode':
      return operation.parentId === id || operation.nodeId === id;
  }
}

function dispatchPress(nodeId: number): void {
  const dispatch = globalThis.__stingDispatchEvent;
  if (!dispatch) throw new Error('Sting conformance event dispatcher is unavailable');
  dispatch(nodeId, 'press', 'null');
}

function update(write: () => void): void {
  write();
  flush();
}

function percentile(sortedSamples: readonly number[], value: number): number {
  if (sortedSamples.length === 0) return 0;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(sortedSamples.length * value) - 1),
  );
  return sortedSamples[index] ?? 0;
}

function recordLatencyMetrics(
  context: ScenarioContext,
  prefix: string,
  samples: readonly number[],
  unit: string,
): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);
  context.metric(`${prefix}.samples`, sorted.length, 'samples');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, unit);
  context.metric(`${prefix}.mean`, sorted.length === 0 ? 0 : total / sorted.length, unit);
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), unit);
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), unit);
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), unit);
  context.metric(`${prefix}.max`, sorted[sorted.length - 1] ?? 0, unit);
}

export const scenario: ScenarioDefinition = {
  id: 'renderer',
  title: 'Sting universal renderer mutation, identity, move, and detach torture',
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
            <View>
              <View>
                <View>
                  <Button onPress={() => deepHits++} />
                </View>
              </View>
            </View>
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

    const allTransitionOperations: Operation[] = [];
    const capture = (): Operation[] => {
      const operations = recording.take();
      allTransitionOperations.push(...operations);
      return operations;
    };

    try {
      const appRoot = host.root.children[0];
      context.assert('renderer app mounts as one native root view', appRoot?.type === 'view');
      if (!appRoot) return;
      context.assert('renderer app exposes all eight stable sections', appRoot.children.length === 8);

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
      context.assert('mixed section starts with one text identity', initialText.isText);
      update(() => setMixedMode('beta'));
      let operations = capture();
      context.assert('text -> text preserves native identity', mixedSection.children[0] === initialText);
      assertCount(context, 'text -> text emits one replaceText', operations, 'replaceText', 1);
      assertNoStructure(context, 'text -> text emits no structural replay', operations);

      update(() => setMixedMode('component'));
      operations = capture();
      const firstMixedButton = mixedSection.children[0]!;
      context.assert('text -> component installs a native button', firstMixedButton.type === 'button');
      assertCount(context, 'text -> component creates one element', operations, 'createElement', 1);
      assertCount(context, 'text -> component inserts one element', operations, 'insertNode', 1);
      assertCount(context, 'text -> component detaches one text node', operations, 'removeNode', 1);
      context.assert('detached text remains registered for runtime identity safety', recording.isRegistered(initialText.id));
      context.assert('detached text is no longer connected', !recording.attachedIds().has(initialText.id));
      dispatchPress(firstMixedButton.id);
      context.assert('component event is live before replacement', mixedHits === 1);

      const mixedHitsBeforeDetach = mixedHits;
      update(() => setMixedMode('gamma'));
      operations = capture();
      const gammaText = mixedSection.children[0]!;
      context.assert('component -> text installs gamma text', gammaText.isText && gammaText.textValue === 'gamma');
      assertCount(context, 'component -> text creates one text node', operations, 'createTextNode', 1);
      assertCount(context, 'component -> text inserts one text node', operations, 'insertNode', 1);
      assertCount(context, 'component -> text detaches one component', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(
        context,
        'component -> text disables event before native detach',
        operations,
        firstMixedButton.id,
        firstMixedButton.id,
      );
      dispatchPress(firstMixedButton.id);
      context.assert('detached component cannot receive stale callbacks', mixedHits === mixedHitsBeforeDetach);
      context.assert('detached component remains registered but disconnected', recording.isRegistered(firstMixedButton.id) && !recording.attachedIds().has(firstMixedButton.id));

      update(() => setMixedMode('empty'));
      operations = capture();
      context.assert('text -> null leaves no child', mixedSection.children.length === 0);
      assertCount(context, 'text -> null detaches exactly one node', operations, 'removeNode', 1);

      update(() => setMixedMode('component'));
      operations = capture();
      const secondMixedButton = mixedSection.children[0]!;
      context.assert('null -> component mounts a fresh button identity', secondMixedButton.type === 'button' && secondMixedButton.id !== firstMixedButton.id);
      assertCount(context, 'null -> component creates one element', operations, 'createElement', 1);
      assertCount(context, 'null -> component inserts one element', operations, 'insertNode', 1);

      const mixedBeforeNull = mixedHits;
      update(() => setMixedMode('empty'));
      operations = capture();
      assertEventDisabledBeforeRemoval(
        context,
        'component -> null disables event before detach',
        operations,
        secondMixedButton.id,
        secondMixedButton.id,
      );
      dispatchPress(secondMixedButton.id);
      context.assert('component -> null leaves no stale callback', mixedHits === mixedBeforeNull);
      assertTreeIntegrity(context, 'scalar replacements', host.root, recording);

      context.assert(
        'array starts with stable A/B/C identities',
        arraySection.children[0] === arrayA &&
          arraySection.children[1] === arrayB &&
          arraySection.children[2] === arrayC,
      );
      update(() => setArrayOrder([arrayC, arrayA, arrayB]));
      operations = capture();
      context.assert('array reorder preserves C/A/B object identity', arraySection.children[0] === arrayC && arraySection.children[1] === arrayA && arraySection.children[2] === arrayB);
      context.assert('array reorder uses native insert moves', count(operations, 'insertNode') > 0, trace(operations));
      assertCount(context, 'array reorder creates nothing', operations, 'createElement', 0);
      assertMoveDetachesAreReinserted(context, 'array reorder has no permanent detach', operations);

      update(() => setArrayOrder([arrayA, arrayB, arrayC]));
      capture();

      const arrayD = host.createElement('button');
      host.setProperty(arrayD, 'onPress', () => arrayDHits++);
      capture();

      const cHitsBeforeDetach = arrayCHits;
      update(() => setArrayOrder([arrayA, arrayB, arrayD]));
      operations = capture();
      context.assert('array replacement preserves A/B and installs D', arraySection.children[0] === arrayA && arraySection.children[1] === arrayB && arraySection.children[2] === arrayD);
      assertCount(context, 'array replacement inserts D once', operations, 'insertNode', 1);
      assertCount(context, 'array replacement detaches C once', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(context, 'array replacement disables C before detach', operations, arrayC.id, arrayC.id);
      dispatchPress(arrayC.id);
      context.assert('detached array node cannot receive stale event', arrayCHits === cHitsBeforeDetach);
      context.assert('detached array node stays registered', recording.isRegistered(arrayC.id));
      context.assert('detached array node is not connected', !recording.attachedIds().has(arrayC.id));

      update(() => setArrayOrder([arrayC, arrayA, arrayB, arrayD]));
      operations = capture();
      context.assert('keyed reconciliation can reinsert the same detached C identity', arraySection.children[0] === arrayC && recording.attachedIds().has(arrayC.id));
      context.assert('reinserting C reactivates its press event', operations.some(operation => operation.kind === 'setEventEnabled' && operation.id === arrayC.id && operation.event === 'press' && operation.enabled));
      dispatchPress(arrayC.id);
      context.assert('reinserted C event is live again', arrayCHits === cHitsBeforeDetach + 1);

      update(() => setArrayOrder([arrayA, arrayB, arrayD]));
      capture();
      assertTreeIntegrity(context, 'array detach/reinsert', host.root, recording);

      const firstDeepRoot = deepSection.children[0]!;
      const firstDeepButton = firstDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('deep subtree exposes nested event button', firstDeepButton?.type === 'button');
      if (!firstDeepButton) return;
      const firstDeepIds = collectHostIds(firstDeepRoot);
      dispatchPress(firstDeepButton.id);
      context.assert('deep descendant event starts live', deepHits === 1);

      const deepHitsBeforeDetach = deepHits;
      update(() => setDeepVisible(false));
      operations = capture();
      assertEventDisabledBeforeRemoval(
        context,
        'deep descendant event disables before parent detach',
        operations,
        firstDeepButton.id,
        firstDeepRoot.id,
      );
      for (const id of firstDeepIds) {
        context.assert(`deep detached id ${id} remains registered`, recording.isRegistered(id));
        context.assert(`deep detached id ${id} is disconnected`, !recording.attachedIds().has(id));
      }
      dispatchPress(firstDeepButton.id);
      context.assert('deep parent detach leaves no stale descendant callback', deepHits === deepHitsBeforeDetach);

      update(() => setDeepVisible(true));
      operations = capture();
      const secondDeepRoot = deepSection.children[0]!;
      const secondDeepButton = secondDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('conditional deep remount allocates a fresh root identity', secondDeepRoot.id !== firstDeepRoot.id);
      context.assert('conditional deep remount allocates a fresh event identity', secondDeepButton != null && secondDeepButton.id !== firstDeepButton.id);
      context.assert('deep remount creates native structure', count(operations, 'createElement') >= 4 && count(operations, 'insertNode') >= 4, trace(operations));
      assertTreeIntegrity(context, 'deep subtree replacement', host.root, recording);

      update(() => setPropertyLabel('label-0'));
      operations = capture();
      context.assert('same property signal value emits no bridge work', operations.length === 0, trace(operations));

      const propertySamples: number[] = [];
      const propertyOperations: Operation[] = [];
      for (let index = 1; index <= 32; index++) {
        const started = context.now();
        update(() => setPropertyLabel(`label-${index}`));
        propertySamples.push(context.now() - started);
        const sampleOperations = capture();
        propertyOperations.push(...sampleOperations);
        assertCount(context, `property sample ${index} emits one setProperty`, sampleOperations, 'setProperty', 1);
        assertNoStructure(context, `property sample ${index} preserves structure`, sampleOperations);
      }
      recordLatencyMetrics(context, 'rapid-property', propertySamples, 'ms/update');
      context.metric('rapid-property.native.setProperty', count(propertyOperations, 'setProperty'), 'mutations');
      context.assert('property section keeps stable native identity', appRoot.children[4] === propertySection);

      let handlerAHits = 0;
      let handlerBHits = 0;
      const handlerA = (): void => { handlerAHits++; };
      const handlerB = (): void => { handlerBHits++; };

      host.setProperty(eventButton, 'onPress', handlerA);
      operations = capture();
      assertCount(context, 'first event handler enables native event', operations, 'setEventEnabled', 1);
      dispatchPress(eventButton.id);
      context.assert('first event handler dispatches', handlerAHits === 1);

      host.setProperty(eventButton, 'onPress', handlerB);
      operations = capture();
      context.assert('event replacement keeps native event enabled', operations.some(operation => operation.kind === 'setEventEnabled' && operation.id === eventButton.id && operation.enabled));
      dispatchPress(eventButton.id);
      context.assert('event replacement stops calling old handler', handlerAHits === 1);
      context.assert('event replacement dispatches latest handler', handlerBHits === 1);

      host.setProperty(eventButton, 'onPress', null);
      operations = capture();
      context.assert('event removal disables native event', operations.some(operation => operation.kind === 'setEventEnabled' && operation.id === eventButton.id && !operation.enabled));
      dispatchPress(eventButton.id);
      context.assert('removed event handler cannot fire', handlerBHits === 1);

      const reorderSamples: number[] = [];
      const reorderOperations: Operation[] = [];
      for (let index = 0; index < 32; index++) {
        const front = index % 2 === 0;
        const started = context.now();
        update(() => setArrayOrder(front ? [arrayD, arrayA, arrayB] : [arrayA, arrayB, arrayD]));
        reorderSamples.push(context.now() - started);
        const sampleOperations = capture();
        reorderOperations.push(...sampleOperations);
        context.assert(`array move sample ${index + 1} emits insert moves`, count(sampleOperations, 'insertNode') > 0, trace(sampleOperations));
        assertCount(context, `array move sample ${index + 1} creates nothing`, sampleOperations, 'createElement', 0);
        assertMoveDetachesAreReinserted(context, `array move sample ${index + 1} has no permanent detach`, sampleOperations);
        context.assert(`array move sample ${index + 1} keeps parent bookkeeping valid`, arraySection.children.length === 3 && arraySection.children.every(child => host.getParentNode(child) === arraySection));
      }
      recordLatencyMetrics(context, 'array-reorder', reorderSamples, 'ms/reorder');
      context.metric('array-reorder.native.insertNode', count(reorderOperations, 'insertNode'), 'mutations');
      context.metric('array-reorder.native.removeNode', count(reorderOperations, 'removeNode'), 'mutations');

      const cycleSamples: number[] = [];
      const cycleOperations: Operation[] = [];
      let previousCycleId = -1;
      for (let index = 0; index < 32; index++) {
        const started = context.now();
        update(() => setCycleVisible(true));
        const mounted = cycleSection.children[0];
        context.assert(`cycle ${index + 1} mounts one button`, mounted?.type === 'button');
        if (!mounted) return;
        context.assert(`cycle ${index + 1} allocates a fresh id`, mounted.id !== previousCycleId);
        previousCycleId = mounted.id;

        let sampleOperations = capture();
        cycleOperations.push(...sampleOperations);
        assertCount(context, `cycle ${index + 1} creates one element`, sampleOperations, 'createElement', 1);
        assertCount(context, `cycle ${index + 1} inserts one element`, sampleOperations, 'insertNode', 1);
        context.assert(`cycle ${index + 1} enables press`, sampleOperations.some(operation => operation.kind === 'setEventEnabled' && operation.id === mounted.id && operation.enabled));

        dispatchPress(mounted.id);
        const hitsBeforeUnmount = cycleHits;
        update(() => setCycleVisible(false));
        sampleOperations = capture();
        cycleOperations.push(...sampleOperations);
        assertCount(context, `cycle ${index + 1} detaches one element`, sampleOperations, 'removeNode', 1);
        assertEventDisabledBeforeRemoval(context, `cycle ${index + 1} disables event before detach`, sampleOperations, mounted.id, mounted.id);
        context.assert(`cycle ${index + 1} leaves section empty`, cycleSection.children.length === 0);
        context.assert(`cycle ${index + 1} keeps detached id registered`, recording.isRegistered(mounted.id));
        context.assert(`cycle ${index + 1} disconnects detached id`, !recording.attachedIds().has(mounted.id));
        dispatchPress(mounted.id);
        context.assert(`cycle ${index + 1} has no stale callback`, cycleHits === hitsBeforeUnmount);
        assertTreeIntegrity(context, `cycle ${index + 1}`, host.root, recording);
        cycleSamples.push(context.now() - started);
      }
      recordLatencyMetrics(context, 'mount-remove', cycleSamples, 'ms/cycle');
      context.metric('mount-remove.native.createElement', count(cycleOperations, 'createElement'), 'mutations');
      context.metric('mount-remove.native.insertNode', count(cycleOperations, 'insertNode'), 'mutations');
      context.metric('mount-remove.native.removeNode', count(cycleOperations, 'removeNode'), 'mutations');
      context.metric('mount-remove.native.setEventEnabled', count(cycleOperations, 'setEventEnabled'), 'mutations');

      context.assert('left sentinel preserves native identity', appRoot.children[0] === stableLeft && stableLeft.id === stableLeftId);
      context.assert('right sentinel preserves native identity', appRoot.children[7] === stableRight && stableRight.id === stableRightId);
      context.assert('renderer torture never mutates unrelated left sentinel', !allTransitionOperations.some(operation => touchesNode(operation, stableLeftId)));
      context.assert('renderer torture never mutates unrelated right sentinel', !allTransitionOperations.some(operation => touchesNode(operation, stableRightId)));

      dispatchPress(arrayA.id);
      dispatchPress(arrayB.id);
      dispatchPress(arrayD.id);
      context.assert('array A event remains live after reorder stress', arrayAHits === 1);
      context.assert('array B event remains live after reorder stress', arrayBHits === 1);
      context.assert('array D event remains live after reorder stress', arrayDHits === 1);

      assertTreeIntegrity(context, 'final steady state', host.root, recording);
      context.metric('renderer.registered-native-identities', recording.registeredIds().size, 'nodes');
      context.metric('renderer.attached-native-identities', recording.attachedIds().size, 'nodes');
    } finally {
      dispose();
      resetNativeBridgeForTests();
    }
  },
};
