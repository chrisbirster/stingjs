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

class RecordingBridge implements StingNativeBridge {
  private operations: Operation[] = [];
  private readonly alive = new Set<number>([0]);
  private readonly children = new Map<number, number[]>([[0, []]]);
  private readonly parent = new Map<number, number | null>([[0, null]]);

  constructor(readonly target: StingNativeBridge) {}

  take(): Operation[] {
    const taken = this.operations;
    this.operations = [];
    return taken;
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
    this.assertNewNode(id);
    this.alive.add(id);
    this.children.set(id, []);
    this.parent.set(id, null);
    this.operations.push({ kind: 'createElement', id, type });
    this.target.createElement(id, type);
  }

  createTextNode(id: number, value: string): void {
    this.assertNewNode(id);
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
    if (!targetChildren) throw new Error(`Native shadow parent ${parentId} has no child list`);

    if (anchorId !== -1) {
      this.assertAlive(anchorId, 'insertNode anchor');
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
    this.assertAlive(parentId, 'removeNode parent');
    this.assertAlive(nodeId, 'removeNode node');

    if (this.parent.get(nodeId) !== parentId) {
      throw new Error(`Native shadow node ${nodeId} is not under parent ${parentId}`);
    }

    const siblings = this.children.get(parentId);
    const index = siblings?.indexOf(nodeId) ?? -1;
    if (!siblings || index < 0) {
      throw new Error(`Native shadow cannot find child ${nodeId} under parent ${parentId}`);
    }

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

  private assertNewNode(id: number): void {
    if (id === 0 || this.alive.has(id)) {
      throw new Error(`Native shadow received duplicate node id ${id}`);
    }
  }

  private assertAlive(id: number, operation: string): void {
    if (!this.alive.has(id)) {
      throw new Error(`${operation} referenced retired native node ${id}`);
    }
  }

  private destroySubtree(id: number): void {
    for (const child of [...(this.children.get(id) ?? [])]) this.destroySubtree(child);
    this.children.delete(id);
    this.parent.delete(id);
    this.alive.delete(id);
  }
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
          return `setProperty(${operation.id},${operation.name},${operation.valueJSON})`;
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
    `event teardown must precede native removal: ${trace(operations)}`,
  );
}

function collectHostIds(node: HostNode, target = new Set<number>()): Set<number> {
  target.add(node.id);
  for (const child of node.children) collectHostIds(child, target);
  return target;
}

function sameIds(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
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
  const alive = recording.aliveIds();

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

function throwsRemovedNode(action: () => void): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && error.message.includes('removed') && error.message.includes('cannot be reused');
  }
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
  const mean = sorted.length === 0 ? 0 : total / sorted.length;

  context.metric(`${prefix}.samples`, sorted.length, 'samples');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, unit);
  context.metric(`${prefix}.mean`, mean, unit);
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), unit);
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), unit);
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), unit);
  context.metric(`${prefix}.max`, sorted[sorted.length - 1] ?? 0, unit);
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
      if (mode === 'component') return <Button onPress={() => mixedHits++} />;
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

      context.assert(
        'renderer torture app has all eight stable sections',
        appRoot.children.length === 8,
        `children=${appRoot.children.length}`,
      );

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

      // text -> text: one persistent text identity, one replaceText, no structure.
      const initialText = mixedSection.children[0]!;
      context.assert('mixed section starts as one text node', initialText.isText);
      update(() => setMixedMode('beta'));
      let operations = capture();
      context.assert('text -> text preserves node identity', mixedSection.children[0] === initialText);
      assertCount(context, 'text -> text emits exactly one replaceText', operations, 'replaceText', 1);
      assertNoStructuralReplay(context, 'text -> text emits no structural replay', operations);
      context.assert(
        'text -> text writes the expected value',
        operations.some(
          operation => operation.kind === 'replaceText' && operation.id === initialText.id && operation.value === 'beta',
        ),
        trace(operations),
      );

      // text -> component: create/enable/insert replacement before retiring text.
      update(() => setMixedMode('component'));
      operations = capture();
      const firstMixedButton = mixedSection.children[0]!;
      context.assert('text -> component installs a native button', firstMixedButton.type === 'button');
      assertCount(context, 'text -> component creates one element', operations, 'createElement', 1);
      assertCount(context, 'text -> component inserts one node', operations, 'insertNode', 1);
      assertCount(context, 'text -> component removes one text node', operations, 'removeNode', 1);
      assertCount(context, 'text -> component enables one event', operations, 'setEventEnabled', 1);
      assertReplacementOrder(
        context,
        'text -> component inserts before removing the old text',
        operations,
        mixedSection.id,
        initialText.id,
        firstMixedButton.id,
      );
      context.assert('retired text id is dead natively', !recording.isAlive(initialText.id));

      dispatchPress(firstMixedButton.id);
      context.assert('component event is live before replacement', mixedHits === 1);

      // component -> text: preserve parent identity, disable stale event before remove.
      const hitsBeforeMixedRemoval = mixedHits;
      update(() => setMixedMode('gamma'));
      operations = capture();
      const gammaText = mixedSection.children[0]!;
      context.assert('component -> text installs a text node', gammaText.isText && gammaText.textValue === 'gamma');
      assertCount(context, 'component -> text creates one text node', operations, 'createTextNode', 1);
      assertCount(context, 'component -> text inserts one text node', operations, 'insertNode', 1);
      assertCount(context, 'component -> text removes one component', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(
        context,
        'component -> text disables event before removal',
        operations,
        firstMixedButton.id,
        firstMixedButton.id,
      );
      assertReplacementOrder(
        context,
        'component -> text inserts before removing component',
        operations,
        mixedSection.id,
        firstMixedButton.id,
        gammaText.id,
      );
      dispatchPress(firstMixedButton.id);
      context.assert('removed component cannot receive stale callbacks', mixedHits === hitsBeforeMixedRemoval);
      context.assert(
        'removed component rejects property reuse',
        throwsRemovedNode(() => host.setProperty(firstMixedButton, 'accessibilityLabel', 'ghost')),
      );
      context.assert(
        'removed component rejects reinsertion',
        throwsRemovedNode(() => host.insertNode(mixedSection, firstMixedButton)),
      );
      context.assert('removed component reuse attempts emit no native operations', recording.take().length === 0);

      // component/null transitions.
      update(() => setMixedMode('empty'));
      operations = capture();
      context.assert('text -> null leaves no child', mixedSection.children.length === 0);
      assertCount(context, 'text -> null removes exactly one node', operations, 'removeNode', 1);
      assertCount(context, 'text -> null does not create', operations, 'createElement', 0);
      assertCount(context, 'text -> null does not insert', operations, 'insertNode', 0);

      update(() => setMixedMode('component'));
      operations = capture();
      const secondMixedButton = mixedSection.children[0]!;
      context.assert('null -> component mounts button', secondMixedButton.type === 'button');
      assertCount(context, 'null -> component creates exactly one element', operations, 'createElement', 1);
      assertCount(context, 'null -> component inserts exactly one node', operations, 'insertNode', 1);
      assertCount(context, 'null -> component removes nothing', operations, 'removeNode', 0);

      const hitsBeforeSecondRemoval = mixedHits;
      update(() => setMixedMode('empty'));
      operations = capture();
      context.assert('component -> null leaves no child', mixedSection.children.length === 0);
      assertCount(context, 'component -> null removes exactly one node', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(
        context,
        'component -> null disables event before removal',
        operations,
        secondMixedButton.id,
        secondMixedButton.id,
      );
      dispatchPress(secondMixedButton.id);
      context.assert('component -> null leaves no stale callback', mixedHits === hitsBeforeSecondRemoval);
      assertTreeIntegrity(context, 'scalar replacements', host.root, recording);

      // array -> array reorders must move existing identities, never recreate them.
      context.assert(
        'array starts with stable A/B/C identities',
        arraySection.children[0] === arrayA &&
          arraySection.children[1] === arrayB &&
          arraySection.children[2] === arrayC,
      );

      update(() => setArrayOrder([arrayC, arrayA, arrayB]));
      operations = capture();
      context.assert(
        'array reorder preserves C/A/B identity',
        arraySection.children[0] === arrayC &&
          arraySection.children[1] === arrayA &&
          arraySection.children[2] === arrayB,
      );
      assertCount(context, 'array reorder performs one native move', operations, 'insertNode', 1);
      assertCount(context, 'array reorder creates nothing', operations, 'createElement', 0);
      assertCount(context, 'array reorder removes nothing', operations, 'removeNode', 0);
      context.assert(
        'array reorder moves C before A using an anchor',
        operations.some(
          operation =>
            operation.kind === 'insertNode' &&
            operation.parentId === arraySection.id &&
            operation.nodeId === arrayC.id &&
            operation.anchorId === arrayA.id,
        ),
        trace(operations),
      );
      context.assert(
        'array parent bookkeeping survives move',
        host.getParentNode(arrayC) === arraySection && host.getNextSibling(arrayC) === arrayA,
      );

      update(() => setArrayOrder([arrayA, arrayB, arrayC]));
      operations = capture();
      assertCount(context, 'array move back performs one native move', operations, 'insertNode', 1);
      assertCount(context, 'array move back still creates nothing', operations, 'createElement', 0);
      assertCount(context, 'array move back still removes nothing', operations, 'removeNode', 0);

      // Structural array replacement inserts D before retiring C and tears down
      // C's native event without replaying unaffected A/B identities.
      const arrayD = host.createElement('button');
      host.setProperty(arrayD, 'onPress', () => arrayDHits++);
      operations = capture();
      assertCount(context, 'array D setup creates one native node', operations, 'createElement', 1);
      assertCount(context, 'array D setup enables one native event', operations, 'setEventEnabled', 1);

      const cHitsBeforeRemoval = arrayCHits;
      update(() => setArrayOrder([arrayA, arrayB, arrayD]));
      operations = capture();
      context.assert(
        'array replacement preserves A/B and installs D',
        arraySection.children[0] === arrayA &&
          arraySection.children[1] === arrayB &&
          arraySection.children[2] === arrayD,
      );
      assertCount(context, 'array replacement inserts exactly one node', operations, 'insertNode', 1);
      assertCount(context, 'array replacement removes exactly one node', operations, 'removeNode', 1);
      assertCount(context, 'array replacement creates nothing during reconciliation', operations, 'createElement', 0);
      assertEventDisabledBeforeRemoval(
        context,
        'array replacement disables C event before removal',
        operations,
        arrayC.id,
        arrayC.id,
      );
      assertReplacementOrder(
        context,
        'array replacement inserts D before removing C',
        operations,
        arraySection.id,
        arrayC.id,
        arrayD.id,
      );
      dispatchPress(arrayC.id);
      context.assert('removed array node cannot receive stale event', arrayCHits === cHitsBeforeRemoval);
      context.assert('removed array node id is retired', !recording.isAlive(arrayC.id));
      context.assert(
        'removed array node rejects renderer mutation',
        throwsRemovedNode(() => host.replaceText(arrayC, 'bad')),
      );
      recording.take();

      // Deep parent removal owns every descendant: one removeNode at the top,
      // event disable on the deep button first, and every descendant id retired.
      const firstDeepRoot = deepSection.children[0]!;
      const firstDeepButton = firstDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('deep subtree exposes nested event button', firstDeepButton?.type === 'button');
      if (!firstDeepButton) return;
      const retiredDeepIds = collectHostIds(firstDeepRoot);
      dispatchPress(firstDeepButton.id);
      context.assert('deep descendant event starts live', deepHits === 1);

      const deepHitsBeforeRemoval = deepHits;
      update(() => setDeepVisible(false));
      operations = capture();
      const deepFallback = deepSection.children[0]!;
      assertCount(context, 'deep replacement creates one fallback root', operations, 'createElement', 1);
      assertCount(context, 'deep replacement inserts one fallback root', operations, 'insertNode', 1);
      assertCount(context, 'deep parent removal emits one native remove', operations, 'removeNode', 1);
      assertEventDisabledBeforeRemoval(
        context,
        'deep descendant event disables before parent removal',
        operations,
        firstDeepButton.id,
        firstDeepRoot.id,
      );
      assertReplacementOrder(
        context,
        'deep fallback inserts before old parent removal',
        operations,
        deepSection.id,
        firstDeepRoot.id,
        deepFallback.id,
      );
      for (const retiredId of retiredDeepIds) {
        context.assert(`deep removal retires native id ${retiredId}`, !recording.isAlive(retiredId));
      }
      dispatchPress(firstDeepButton.id);
      context.assert('deep parent removal leaves no stale descendant callback', deepHits === deepHitsBeforeRemoval);
      context.assert(
        'deep removed parent rejects resurrection',
        throwsRemovedNode(() => host.insertNode(deepSection, firstDeepRoot)),
      );
      context.assert(
        'deep removed descendant rejects property mutation',
        throwsRemovedNode(() => host.setProperty(firstDeepButton, 'accessibilityLabel', 'retired')),
      );
      context.assert('deep retired node attempts emit no native operations', recording.take().length === 0);

      update(() => setDeepVisible(true));
      operations = capture();
      const secondDeepRoot = deepSection.children[0]!;
      const secondDeepButton = secondDeepRoot.children[0]?.children[0]?.children[0];
      context.assert('deep subtree remount gets a fresh root id', secondDeepRoot.id !== firstDeepRoot.id);
      context.assert(
        'deep subtree remount gets fresh descendant identity',
        secondDeepButton != null && secondDeepButton.id !== firstDeepButton.id,
      );
      assertCount(context, 'deep remount creates four native elements', operations, 'createElement', 4);
      assertCount(context, 'deep remount inserts four native elements', operations, 'insertNode', 4);
      assertCount(context, 'deep remount removes fallback once', operations, 'removeNode', 1);
      assertTreeIntegrity(context, 'deep subtree replacement', host.root, recording);

      // Property writes: Solid signal equality suppresses identical writes, and
      // StingHost performs a final JSON-level dedupe for direct repeated values.
      update(() => setPropertyLabel('label-0'));
      operations = capture();
      context.assert('same property signal value emits no bridge work', operations.length === 0, trace(operations));

      host.setProperty(propertySection, 'accessibilityLabel', 'label-0');
      host.setProperty(propertySection, 'accessibilityLabel', 'label-0');
      operations = capture();
      context.assert('repeated identical property writes are deduplicated', operations.length === 0, trace(operations));

      host.setProperty(propertySection, 'style', { padding: 7 });
      host.setProperty(propertySection, 'style', { padding: 7 });
      operations = capture();
      assertCount(context, 'identical serialized object property writes cross once', operations, 'setProperty', 1);
      assertNoStructuralReplay(context, 'property writes never replay structure', operations);

      const propertySamples: number[] = [];
      const propertyOperations: Operation[] = [];
      for (let index = 1; index <= 64; index++) {
        const started = context.now();
        update(() => setPropertyLabel(`label-${index}`));
        propertySamples.push(context.now() - started);
        const sampleOperations = capture();
        propertyOperations.push(...sampleOperations);
        assertCount(
          context,
          `rapid property sample ${index} emits one setProperty`,
          sampleOperations,
          'setProperty',
          1,
        );
        assertNoStructuralReplay(
          context,
          `rapid property sample ${index} preserves native identity`,
          sampleOperations,
        );
      }
      recordLatencyMetrics(context, 'rapid-property', propertySamples, 'ms/update');
      context.metric('rapid-property.native.setProperty', count(propertyOperations, 'setProperty'), 'mutations');
      context.metric('rapid-property.native.insertNode', count(propertyOperations, 'insertNode'), 'mutations');
      context.metric('rapid-property.native.removeNode', count(propertyOperations, 'removeNode'), 'mutations');

      // Event replacement is JS-only while enabled. Native sees only edge
      // transitions; dispatch always reaches the latest handler and none after removal.
      let handlerAHits = 0;
      let handlerBHits = 0;
      const handlerA = (): void => {
        handlerAHits++;
      };
      const handlerB = (): void => {
        handlerBHits++;
      };

      host.setProperty(eventButton, 'onPress', handlerA);
      operations = capture();
      assertCount(context, 'first event handler enables native event once', operations, 'setEventEnabled', 1);

      host.setProperty(eventButton, 'onPress', handlerB);
      operations = capture();
      context.assert('event handler replacement does not re-enable native event', operations.length === 0, trace(operations));
      dispatchPress(eventButton.id);
      context.assert('event replacement stops calling old handler', handlerAHits === 0);
      context.assert('event replacement dispatches latest handler', handlerBHits === 1);

      host.setProperty(eventButton, 'onPress', null);
      operations = capture();
      assertCount(context, 'event handler removal disables native event once', operations, 'setEventEnabled', 1);
      host.setProperty(eventButton, 'onPress', null);
      operations = capture();
      context.assert('repeated event removal is deduplicated', operations.length === 0, trace(operations));
      dispatchPress(eventButton.id);
      context.assert('removed event handler cannot fire', handlerBHits === 1);

      host.setProperty(eventButton, 'onPress', handlerA);
      operations = capture();
      assertCount(context, 'event handler can be re-enabled after removal', operations, 'setEventEnabled', 1);

      // Repeated array moves torture insert-before-anchor bookkeeping without
      // creating/removing nodes or replaying events/properties.
      const reorderSamples: number[] = [];
      const reorderOperations: Operation[] = [];
      for (let index = 0; index < 64; index++) {
        const front = index % 2 === 0;
        const started = context.now();
        update(() => setArrayOrder(front ? [arrayD, arrayA, arrayB] : [arrayA, arrayB, arrayD]));
        reorderSamples.push(context.now() - started);
        const sampleOperations = capture();
        reorderOperations.push(...sampleOperations);
        assertCount(
          context,
          `array move sample ${index + 1} emits exactly one insertNode`,
          sampleOperations,
          'insertNode',
          1,
        );
        assertCount(context, `array move sample ${index + 1} creates nothing`, sampleOperations, 'createElement', 0);
        assertCount(context, `array move sample ${index + 1} removes nothing`, sampleOperations, 'removeNode', 0);
        assertCount(context, `array move sample ${index + 1} replays no events`, sampleOperations, 'setEventEnabled', 0);
        context.assert(
          `array move sample ${index + 1} keeps parent bookkeeping valid`,
          arraySection.children.length === 3 &&
            arraySection.children.every(child => host.getParentNode(child) === arraySection),
        );
      }
      recordLatencyMetrics(context, 'array-reorder', reorderSamples, 'ms/reorder');
      context.metric('array-reorder.native.insertNode', count(reorderOperations, 'insertNode'), 'mutations');
      context.metric('array-reorder.native.createElement', count(reorderOperations, 'createElement'), 'mutations');
      context.metric('array-reorder.native.removeNode', count(reorderOperations, 'removeNode'), 'mutations');

      // Repeated mount/remove cycles must allocate fresh IDs, disable events
      // before each remove, leave the section empty, and never accumulate ghosts.
      const cycleSamples: number[] = [];
      const cycleOperations: Operation[] = [];
      let previousCycleId = -1;
      for (let index = 0; index < 64; index++) {
        const started = context.now();
        update(() => setCycleVisible(true));
        const mounted = cycleSection.children[0];
        context.assert(`cycle ${index + 1} mounts one button`, mounted?.type === 'button');
        if (!mounted) return;
        context.assert(`cycle ${index + 1} allocates a fresh node id`, mounted.id !== previousCycleId);
        const mountedId = mounted.id;
        previousCycleId = mountedId;

        let sampleOperations = capture();
        assertCount(context, `cycle ${index + 1} mount creates one element`, sampleOperations, 'createElement', 1);
        assertCount(context, `cycle ${index + 1} mount inserts one element`, sampleOperations, 'insertNode', 1);
        assertCount(context, `cycle ${index + 1} mount enables one event`, sampleOperations, 'setEventEnabled', 1);
        cycleOperations.push(...sampleOperations);

        dispatchPress(mountedId);
        const hitsBeforeUnmount = cycleHits;
        update(() => setCycleVisible(false));
        sampleOperations = capture();
        assertCount(context, `cycle ${index + 1} unmount removes one element`, sampleOperations, 'removeNode', 1);
        assertEventDisabledBeforeRemoval(
          context,
          `cycle ${index + 1} disables event before removal`,
          sampleOperations,
          mountedId,
          mountedId,
        );
        cycleOperations.push(...sampleOperations);
        context.assert(`cycle ${index + 1} leaves section empty`, cycleSection.children.length === 0);
        context.assert(`cycle ${index + 1} retires native id`, !recording.isAlive(mountedId));
        dispatchPress(mountedId);
        context.assert(`cycle ${index + 1} has no stale callback`, cycleHits === hitsBeforeUnmount);
        context.assert(
          `cycle ${index + 1} rejects retired property writes`,
          throwsRemovedNode(() => host.setProperty(mounted, 'accessibilityLabel', 'stale')),
        );
        context.assert(`cycle ${index + 1} retired write emits nothing`, recording.take().length === 0);
        assertTreeIntegrity(context, `cycle ${index + 1}`, host.root, recording);
        cycleSamples.push(context.now() - started);
      }
      recordLatencyMetrics(context, 'mount-remove', cycleSamples, 'ms/cycle');
      context.metric('mount-remove.native.createElement', count(cycleOperations, 'createElement'), 'mutations');
      context.metric('mount-remove.native.insertNode', count(cycleOperations, 'insertNode'), 'mutations');
      context.metric('mount-remove.native.removeNode', count(cycleOperations, 'removeNode'), 'mutations');
      context.metric('mount-remove.native.setEventEnabled', count(cycleOperations, 'setEventEnabled'), 'mutations');
      context.metric('mount-remove.native.setProperty', count(cycleOperations, 'setProperty'), 'mutations');

      // The two unrelated sentinels must retain object/id identity and never be
      // targeted by any mutation after initial mount.
      context.assert('left sentinel preserves native identity', appRoot.children[0] === stableLeft && stableLeft.id === stableLeftId);
      context.assert('right sentinel preserves native identity', appRoot.children[7] === stableRight && stableRight.id === stableRightId);
      context.assert(
        'renderer torture never mutates unrelated left sentinel',
        !allTransitionOperations.some(operation => touchesNode(operation, stableLeftId)),
      );
      context.assert(
        'renderer torture never mutates unrelated right sentinel',
        !allTransitionOperations.some(operation => touchesNode(operation, stableRightId)),
      );

      context.assert('array A handler remained attached through moves', arrayAHits === 0);
      context.assert('array B handler remained attached through moves', arrayBHits === 0);
      context.assert('array D handler remained attached through moves', arrayDHits === 0);
      dispatchPress(arrayA.id);
      dispatchPress(arrayB.id);
      dispatchPress(arrayD.id);
      context.assert('array A event remains live after reorder stress', arrayAHits === 1);
      context.assert('array B event remains live after reorder stress', arrayBHits === 1);
      context.assert('array D event remains live after reorder stress', arrayDHits === 1);

      assertTreeIntegrity(context, 'final steady state', host.root, recording);
    } finally {
      dispose();
      resetNativeBridgeForTests();
    }
  },
};
