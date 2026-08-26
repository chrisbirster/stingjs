import { createSignal, flush, type Component } from 'solid-js';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingNativeBridge,
  type StingHost,
} from '@stingjs/core';
import { Text, View } from '@stingjs/native';
import { For, Repeat, renderApp } from '@stingjs/solid';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';

type Operation =
  | { kind: 'createElement'; id: number; type: string }
  | { kind: 'createTextNode'; id: number; value: string }
  | { kind: 'replaceText'; id: number; value: string }
  | { kind: 'setProperty'; id: number; name: string }
  | { kind: 'insertNode'; parentId: number; nodeId: number; anchorId: number }
  | { kind: 'removeNode'; parentId: number; nodeId: number }
  | { kind: 'setEventEnabled'; id: number; event: string; enabled: boolean };

interface MutationCounts {
  createElement: number;
  createTextNode: number;
  replaceText: number;
  setProperty: number;
  insertNode: number;
  removeNode: number;
  setEventEnabled: number;
}

interface Row {
  readonly id: number;
  readonly label: () => string;
  setLabel(value: string): void;
}

interface ListFixture {
  readonly bridge: RecordingBridge;
  readonly host: StingHost;
  readonly rows: () => readonly Row[];
  readonly setRows: (rows: readonly Row[]) => void;
  readonly listNode: HostNode;
  dispose(): void;
}

const EMPTY_COUNTS: MutationCounts = {
  createElement: 0,
  createTextNode: 0,
  replaceText: 0,
  setProperty: 0,
  insertNode: 0,
  removeNode: 0,
  setEventEnabled: 0,
};

class RecordingBridge implements StingNativeBridge {
  readonly operations: Operation[] = [];

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: {},
    });
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

  setProperty(id: number, name: string, _valueJSON: string): void {
    this.operations.push({ kind: 'setProperty', id, name });
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

  callModuleSync(_module: string, _method: string, _argsJSON: string): string {
    return JSON.stringify({ ok: true, value: null });
  }

  mark(): number {
    return this.operations.length;
  }

  countsSince(mark: number): MutationCounts {
    const counts = { ...EMPTY_COUNTS };
    for (let index = mark; index < this.operations.length; index += 1) {
      const operation = this.operations[index];
      if (operation) counts[operation.kind] += 1;
    }
    return counts;
  }
}

function makeRow(id: number, label = `row-${id}`): Row {
  const [readLabel, writeLabel] = createSignal(label);
  return {
    id,
    label: readLabel,
    setLabel(value) {
      writeLabel(value);
    },
  };
}

function makeRows(count: number, start = 0): Row[] {
  return Array.from({ length: count }, (_, index) => makeRow(start + index));
}

const KeyedRow: Component<{ row: Row }> = props => (
  <View>
    <Text>{() => props.row.label()}</Text>
  </View>
);

const PositionalRow: Component<{ row: () => Row }> = props => (
  <View>
    <Text>{() => props.row().label()}</Text>
  </View>
);

function mountList(mode: 'keyed' | 'positional', initialRows: readonly Row[]): ListFixture {
  resetNativeBridgeForTests();
  const bridge = new RecordingBridge();
  const host = installNativeBridge(bridge);
  const [rows, writeRows] = createSignal<readonly Row[]>(initialRows);

  const disposeRender = renderApp(() => (
    <View>
      {mode === 'keyed' ? (
        <For each={rows()}>
          {(row) => <KeyedRow row={row} />}
        </For>
      ) : (
        <For each={rows()} keyed={false}>
          {(row) => <PositionalRow row={row} />}
        </For>
      )}
    </View>
  ));
  flush();

  const listNode = host.root.children[0];
  if (!listNode) {
    disposeRender();
    resetNativeBridgeForTests();
    throw new Error('List fixture failed to mount its native root View');
  }

  return {
    bridge,
    host,
    rows,
    setRows(nextRows) {
      writeRows(nextRows);
      flush();
    },
    listNode,
    dispose() {
      disposeRender();
      resetNativeBridgeForTests();
    },
  };
}

function rowText(rowNode: HostNode): string {
  const textElement = rowNode.children[0];
  const textNode = textElement?.children[0];
  return textNode?.textValue ?? '';
}

function renderedTexts(fixture: ListFixture): string[] {
  return fixture.listNode.children.map(rowText);
}

function expectedTexts(rows: readonly Row[]): string[] {
  return rows.map(row => row.label());
}

function rowNodeIds(fixture: ListFixture): number[] {
  return fixture.listNode.children.map(node => node.id);
}

function identityByLogicalId(fixture: ListFixture, rows: readonly Row[]): Map<number, number> {
  if (fixture.listNode.children.length !== rows.length) {
    throw new Error(
      `Identity capture length mismatch: native=${fixture.listNode.children.length}, data=${rows.length}`,
    );
  }

  return new Map(rows.map((row, index) => [row.id, fixture.listNode.children[index]!.id]));
}

function sameArray<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCounts(actual: MutationCounts, expected: Partial<MutationCounts>): boolean {
  return (Object.keys(expected) as (keyof MutationCounts)[])
    .every(key => actual[key] === expected[key]);
}

function countsDetail(counts: MutationCounts): string {
  return JSON.stringify(counts);
}

function assertTexts(
  context: ScenarioContext,
  name: string,
  fixture: ListFixture,
  rows: readonly Row[],
): void {
  const actual = renderedTexts(fixture);
  const expected = expectedTexts(rows);
  context.assert(name, sameArray(actual, expected), `expected ${expected.join(',')}; got ${actual.join(',')}`);
}

function assertNoUnrelatedMutations(
  context: ScenarioContext,
  name: string,
  counts: MutationCounts,
  allowed: readonly (keyof MutationCounts)[],
): void {
  const allowedSet = new Set(allowed);
  const unexpected = (Object.keys(counts) as (keyof MutationCounts)[])
    .filter(key => !allowedSet.has(key) && counts[key] !== 0);
  context.assert(
    name,
    unexpected.length === 0,
    unexpected.length === 0
      ? undefined
      : `unexpected ${unexpected.map(key => `${key}=${counts[key]}`).join(', ')}; all=${countsDetail(counts)}`,
  );
}

function changedPositions(before: readonly string[], after: readonly string[]): number {
  const shared = Math.min(before.length, after.length);
  let changed = 0;
  for (let index = 0; index < shared; index += 1) {
    if (before[index] !== after[index]) changed += 1;
  }
  return changed;
}

function assertKeyedRetainedIdentity(
  context: ScenarioContext,
  name: string,
  before: Map<number, number>,
  fixture: ListFixture,
  rows: readonly Row[],
): void {
  const after = identityByLogicalId(fixture, rows);
  const mismatches: string[] = [];
  for (const row of rows) {
    const oldId = before.get(row.id);
    if (oldId !== undefined && after.get(row.id) !== oldId) {
      mismatches.push(`${row.id}:${oldId}->${after.get(row.id)}`);
    }
  }
  context.assert(name, mismatches.length === 0, mismatches.join(', '));
}

function runKeyedConformance(context: ScenarioContext): void {
  const initial = makeRows(6);
  const fixture = mountList('keyed', initial);

  try {
    context.assert('keyed mount produces exactly six native row identities', rowNodeIds(fixture).length === 6);
    assertTexts(context, 'keyed mount renders source order', fixture, initial);

    let rows = [...initial];
    let identities = identityByLogicalId(fixture, rows);

    const append = makeRow(6);
    let mark = fixture.bridge.mark();
    rows = [...rows, append];
    fixture.setRows(rows);
    let counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed append renders the appended row', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed append preserves every retained native row identity', identities, fixture, rows);
    context.assert(
      'keyed append creates only the new row subtree',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );
    assertNoUnrelatedMutations(context, 'keyed append has no property/event replay', counts, [
      'createElement',
      'createTextNode',
      'replaceText',
      'insertNode',
    ]);

    identities = identityByLogicalId(fixture, rows);
    const prepend = makeRow(-1);
    mark = fixture.bridge.mark();
    rows = [prepend, ...rows];
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed prepend renders the new first row', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed prepend preserves retained native identities', identities, fixture, rows);
    context.assert(
      'keyed prepend creates only one new row subtree',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    identities = identityByLogicalId(fixture, rows);
    const middle = makeRow(99);
    const middleIndex = Math.floor(rows.length / 2);
    mark = fixture.bridge.mark();
    rows = [...rows.slice(0, middleIndex), middle, ...rows.slice(middleIndex)];
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed middle insert renders in the requested position', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed middle insert preserves retained native identities', identities, fixture, rows);
    context.assert(
      'keyed middle insert creates only one new row subtree',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    const removeAt = (index: number, label: string): void => {
      identities = identityByLogicalId(fixture, rows);
      const removed = rows[index];
      mark = fixture.bridge.mark();
      rows = [...rows.slice(0, index), ...rows.slice(index + 1)];
      fixture.setRows(rows);
      counts = fixture.bridge.countsSince(mark);
      assertTexts(context, `keyed ${label} removal renders the remaining rows`, fixture, rows);
      assertKeyedRetainedIdentity(context, `keyed ${label} removal preserves retained identities`, identities, fixture, rows);
      context.assert(
        `keyed ${label} removal removes exactly one native row`,
        sameCounts(counts, {
          createElement: 0,
          createTextNode: 0,
          replaceText: 0,
          insertNode: 0,
          removeNode: 1,
        }),
        `${removed?.id ?? 'missing'} ${countsDetail(counts)}`,
      );
    };

    removeAt(0, 'first');
    removeAt(Math.floor(rows.length / 2), 'middle');
    removeAt(rows.length - 1, 'last');

    identities = identityByLogicalId(fixture, rows);
    const replaceIndex = Math.floor(rows.length / 2);
    const oldReplacement = rows[replaceIndex]!;
    const replacement = makeRow(oldReplacement.id, `${oldReplacement.label()}-replacement`);
    mark = fixture.bridge.mark();
    rows = rows.map((row, index) => (index === replaceIndex ? replacement : row));
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    const replacementIds = identityByLogicalId(fixture, rows);
    context.assert(
      'keyed replacement by new reference recreates only that logical row',
      replacementIds.get(replacement.id) !== identities.get(replacement.id),
      `old=${identities.get(replacement.id)} new=${replacementIds.get(replacement.id)}`,
    );
    for (const row of rows) {
      if (row === replacement) continue;
      context.assert(
        `keyed replacement preserves row ${row.id}`,
        replacementIds.get(row.id) === identities.get(row.id),
      );
    }
    context.assert(
      'keyed replacement has one remove and one new subtree',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: 1,
        insertNode: 3,
        removeNode: 1,
      }),
      countsDetail(counts),
    );

    const beforeFilter = [...rows];
    identities = identityByLogicalId(fixture, rows);
    const filtered = rows.filter(row => row.id % 2 === 0);
    const removedCount = rows.length - filtered.length;
    mark = fixture.bridge.mark();
    rows = filtered;
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed filter renders only matching rows', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed filter preserves survivor identities', identities, fixture, rows);
    context.assert(
      'keyed filter removes exactly the excluded native rows',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 0,
        insertNode: 0,
        removeNode: removedCount,
      }),
      countsDetail(counts),
    );

    const filteredIdentities = identityByLogicalId(fixture, rows);
    mark = fixture.bridge.mark();
    rows = beforeFilter;
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed expansion restores the pre-filter order', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed expansion preserves identities that survived filtering', filteredIdentities, fixture, rows);
    context.assert(
      'keyed expansion creates exactly the rows disposed by filtering',
      sameCounts(counts, {
        createElement: removedCount * 2,
        createTextNode: removedCount,
        replaceText: removedCount,
        setProperty: 0,
        setEventEnabled: 0,
      }),
      countsDetail(counts),
    );
    context.assert(
      'keyed expansion inserts every recreated row subtree',
      counts.insertNode >= removedCount * 3,
      countsDetail(counts),
    );

    identities = identityByLogicalId(fixture, rows);
    mark = fixture.bridge.mark();
    rows = [...rows].sort((left, right) => right.id - left.id);
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed sort renders sorted data order', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed sort moves native rows without recreating them', identities, fixture, rows);
    assertNoUnrelatedMutations(context, 'keyed sort is structural moves only', counts, ['insertNode']);
    context.assert('keyed sort performs at least one native move', counts.insertNode > 0, countsDetail(counts));

    identities = identityByLogicalId(fixture, rows);
    mark = fixture.bridge.mark();
    rows = [...rows].reverse();
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed reverse renders reversed order', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed reverse preserves every native row identity', identities, fixture, rows);
    assertNoUnrelatedMutations(context, 'keyed reverse is structural moves only', counts, ['insertNode']);
    context.assert('keyed reverse performs native moves', counts.insertNode > 0, countsDetail(counts));

    identities = identityByLogicalId(fixture, rows);
    const moved = rows[rows.length - 1]!;
    const movedNodeId = identities.get(moved.id);
    const withoutMoved = rows.slice(0, -1);
    mark = fixture.bridge.mark();
    rows = [withoutMoved[0]!, moved, ...withoutMoved.slice(1)];
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed move/reorder renders requested order', fixture, rows);
    assertKeyedRetainedIdentity(context, 'keyed move/reorder preserves all identities', identities, fixture, rows);
    const structuralMoves = fixture.bridge.operations
      .slice(mark)
      .filter(operation => operation.kind === 'insertNode' && operation.nodeId === movedNodeId);
    context.assert(
      'keyed single-row reorder moves the existing native row exactly once',
      structuralMoves.length === 1,
      `${structuralMoves.length} moves for native row ${movedNodeId}; all=${countsDetail(counts)}`,
    );
    assertNoUnrelatedMutations(context, 'keyed single-row reorder has no recreation/text replay', counts, ['insertNode']);

    const sparse = rows[Math.floor(rows.length / 2)]!;
    mark = fixture.bridge.mark();
    sparse.setLabel(`${sparse.label()}-sparse`);
    flush();
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed sparse row update renders the changed label', fixture, rows);
    context.assert(
      'keyed sparse row update is exactly one native text mutation',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 1,
        insertNode: 0,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    const denseRows = rows.slice(0, Math.min(4, rows.length));
    mark = fixture.bridge.mark();
    for (const row of denseRows) row.setLabel(`${row.label()}-dense`);
    flush();
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'keyed dense row update renders every changed label', fixture, rows);
    context.assert(
      'keyed dense row update emits exactly one replaceText per changed row',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: denseRows.length,
        insertNode: 0,
        removeNode: 0,
      }),
      countsDetail(counts),
    );
  } finally {
    fixture.dispose();
  }
}

function runPositionalConformance(context: ScenarioContext): void {
  let rows = makeRows(6);
  const fixture = mountList('positional', rows);

  try {
    assertTexts(context, 'non-keyed mount renders source order', fixture, rows);
    let ids = rowNodeIds(fixture);

    const append = makeRow(6);
    let mark = fixture.bridge.mark();
    rows = [...rows, append];
    fixture.setRows(rows);
    let counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed append renders appended item', fixture, rows);
    context.assert(
      'non-keyed append preserves existing positional native identities',
      sameArray(rowNodeIds(fixture).slice(0, ids.length), ids),
    );
    context.assert(
      'non-keyed append creates only the new tail row',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    ids = rowNodeIds(fixture);
    const beforePrependTexts = renderedTexts(fixture);
    const prepend = makeRow(-1);
    mark = fixture.bridge.mark();
    rows = [prepend, ...rows];
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed prepend shifts values through positional rows', fixture, rows);
    context.assert(
      'non-keyed prepend keeps every existing native row at its position',
      sameArray(rowNodeIds(fixture).slice(0, ids.length), ids),
    );
    context.assert(
      'non-keyed prepend updates each reused position and creates one tail row',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: changedPositions(beforePrependTexts, expectedTexts(rows)) + 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    ids = rowNodeIds(fixture);
    const beforeInsertTexts = renderedTexts(fixture);
    const inserted = makeRow(99);
    const insertIndex = 3;
    mark = fixture.bridge.mark();
    rows = [...rows.slice(0, insertIndex), inserted, ...rows.slice(insertIndex)];
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed middle insert shifts positional values', fixture, rows);
    context.assert(
      'non-keyed middle insert keeps all existing position identities',
      sameArray(rowNodeIds(fixture).slice(0, ids.length), ids),
    );
    context.assert(
      'non-keyed middle insert only creates the new tail position',
      sameCounts(counts, {
        createElement: 2,
        createTextNode: 1,
        replaceText: changedPositions(beforeInsertTexts, expectedTexts(rows)) + 1,
        insertNode: 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    const removeAt = (index: number, label: string): void => {
      const beforeIds = rowNodeIds(fixture);
      const beforeTexts = renderedTexts(fixture);
      const nextRows = [...rows.slice(0, index), ...rows.slice(index + 1)];
      mark = fixture.bridge.mark();
      rows = nextRows;
      fixture.setRows(rows);
      counts = fixture.bridge.countsSince(mark);
      assertTexts(context, `non-keyed ${label} removal shifts positional values correctly`, fixture, rows);
      context.assert(
        `non-keyed ${label} removal keeps the surviving positional native identities`,
        sameArray(rowNodeIds(fixture), beforeIds.slice(0, -1)),
      );
      context.assert(
        `non-keyed ${label} removal removes the tail native row and only updates changed positions`,
        sameCounts(counts, {
          createElement: 0,
          createTextNode: 0,
          replaceText: changedPositions(beforeTexts, expectedTexts(rows)),
          insertNode: 0,
          removeNode: 1,
        }),
        countsDetail(counts),
      );
    };

    removeAt(0, 'first');
    removeAt(Math.floor(rows.length / 2), 'middle');
    removeAt(rows.length - 1, 'last');

    ids = rowNodeIds(fixture);
    const replacementIndex = Math.floor(rows.length / 2);
    const replacement = makeRow(rows[replacementIndex]!.id, 'non-keyed-replacement');
    mark = fixture.bridge.mark();
    rows = rows.map((row, index) => (index === replacementIndex ? replacement : row));
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed replacement updates the existing positional row', fixture, rows);
    context.assert('non-keyed replacement preserves all native row identities', sameArray(rowNodeIds(fixture), ids));
    context.assert(
      'non-keyed replacement is exactly one text mutation with no structure churn',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 1,
        insertNode: 0,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    const expanded = [...rows];
    ids = rowNodeIds(fixture);
    const beforeFilterTexts = renderedTexts(fixture);
    const filtered = rows.filter(row => row.id % 2 === 0);
    mark = fixture.bridge.mark();
    rows = filtered;
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed filter renders filtered values by position', fixture, rows);
    context.assert(
      'non-keyed filter retains the first N positional native identities',
      sameArray(rowNodeIds(fixture), ids.slice(0, rows.length)),
    );
    context.assert(
      'non-keyed filter removes only tail positions and updates changed retained positions',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: changedPositions(beforeFilterTexts, expectedTexts(rows)),
        insertNode: 0,
        removeNode: expanded.length - rows.length,
      }),
      countsDetail(counts),
    );

    ids = rowNodeIds(fixture);
    const beforeExpandTexts = renderedTexts(fixture);
    const addedPositions = expanded.length - rows.length;
    mark = fixture.bridge.mark();
    rows = expanded;
    fixture.setRows(rows);
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed expansion restores all values by position', fixture, rows);
    context.assert(
      'non-keyed expansion preserves all surviving positional identities',
      sameArray(rowNodeIds(fixture).slice(0, ids.length), ids),
    );
    context.assert(
      'non-keyed expansion creates only new tail positions',
      sameCounts(counts, {
        createElement: addedPositions * 2,
        createTextNode: addedPositions,
        replaceText: changedPositions(beforeExpandTexts, expectedTexts(rows)) + addedPositions,
        insertNode: addedPositions * 3,
        removeNode: 0,
      }),
      countsDetail(counts),
    );

    const assertFixedLengthReorder = (nextRows: Row[], label: string): void => {
      const beforeIds = rowNodeIds(fixture);
      const beforeTexts = renderedTexts(fixture);
      mark = fixture.bridge.mark();
      rows = nextRows;
      fixture.setRows(rows);
      counts = fixture.bridge.countsSince(mark);
      assertTexts(context, `non-keyed ${label} renders requested value order`, fixture, rows);
      context.assert(`non-keyed ${label} preserves positional identities`, sameArray(rowNodeIds(fixture), beforeIds));
      context.assert(
        `non-keyed ${label} performs text updates only`,
        sameCounts(counts, {
          createElement: 0,
          createTextNode: 0,
          replaceText: changedPositions(beforeTexts, expectedTexts(rows)),
          insertNode: 0,
          removeNode: 0,
        }),
        countsDetail(counts),
      );
    };

    assertFixedLengthReorder([...rows].sort((left, right) => right.id - left.id), 'sort');
    assertFixedLengthReorder([...rows].reverse(), 'reverse');
    const moved = rows[rows.length - 1]!;
    assertFixedLengthReorder([moved, ...rows.slice(0, -1)], 'move/reorder');

    const sparse = rows[Math.floor(rows.length / 2)]!;
    mark = fixture.bridge.mark();
    sparse.setLabel(`${sparse.label()}-sparse`);
    flush();
    counts = fixture.bridge.countsSince(mark);
    assertTexts(context, 'non-keyed sparse nested row update renders changed text', fixture, rows);
    context.assert(
      'non-keyed sparse nested row update remains exactly one replaceText',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 1,
        insertNode: 0,
        removeNode: 0,
      }),
      countsDetail(counts),
    );
  } finally {
    fixture.dispose();
  }
}

function runRepeatConformance(context: ScenarioContext): void {
  resetNativeBridgeForTests();
  const bridge = new RecordingBridge();
  const host = installNativeBridge(bridge);
  const [count, setCount] = createSignal(4);

  const disposeRender = renderApp(() => (
    <View>
      <Repeat count={count()} from={2}>
        {(index) => (
          <View>
            <Text>{`repeat-${index}`}</Text>
          </View>
        )}
      </Repeat>
    </View>
  ));
  flush();

  try {
    const root = host.root.children[0];
    if (!root) throw new Error('Repeat fixture failed to mount its native root View');

    context.assert(
      'Repeat honors count and from without an input array',
      sameArray(root.children.map(rowText), ['repeat-2', 'repeat-3', 'repeat-4', 'repeat-5']),
    );
    const initialIds = root.children.map(node => node.id);

    let mark = bridge.mark();
    setCount(7);
    flush();
    let counts = bridge.countsSince(mark);
    context.assert(
      'Repeat growth preserves all existing native identities',
      sameArray(root.children.slice(0, initialIds.length).map(node => node.id), initialIds),
    );
    context.assert(
      'Repeat growth creates exactly the additional count rows',
      sameCounts(counts, {
        createElement: 6,
        createTextNode: 3,
        replaceText: 3,
        insertNode: 9,
        removeNode: 0,
      }),
      countsDetail(counts),
    );
    context.assert(
      'Repeat growth produces deterministic indices',
      sameArray(root.children.map(rowText), [
        'repeat-2',
        'repeat-3',
        'repeat-4',
        'repeat-5',
        'repeat-6',
        'repeat-7',
        'repeat-8',
      ]),
    );

    const grownIds = root.children.map(node => node.id);
    mark = bridge.mark();
    setCount(3);
    flush();
    counts = bridge.countsSince(mark);
    context.assert(
      'Repeat shrink preserves the surviving prefix identities',
      sameArray(root.children.map(node => node.id), grownIds.slice(0, 3)),
    );
    context.assert(
      'Repeat shrink removes exactly the excess native rows with no diff/replay',
      sameCounts(counts, {
        createElement: 0,
        createTextNode: 0,
        replaceText: 0,
        insertNode: 0,
        removeNode: 4,
      }),
      countsDetail(counts),
    );
    context.assert(
      'Repeat shrink leaves no ghost rows',
      sameArray(root.children.map(rowText), ['repeat-2', 'repeat-3', 'repeat-4']),
    );
  } finally {
    disposeRender();
    resetNativeBridgeForTests();
  }
}

interface Sample {
  durationMs: number;
  mutations: MutationCounts;
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.min(index, sorted.length - 1)] ?? 0;
}

function emitSampleMetrics(context: ScenarioContext, name: string, samples: readonly Sample[]): void {
  const durations = samples.map(sample => sample.durationMs).sort((left, right) => left - right);
  const mean = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);

  context.metric(`${name}.samples`, samples.length, 'count');
  context.metric(`${name}.min`, durations[0] ?? 0, 'ms');
  context.metric(`${name}.mean`, mean, 'ms');
  context.metric(`${name}.p50`, percentile(durations, 0.50), 'ms');
  context.metric(`${name}.p95`, percentile(durations, 0.95), 'ms');
  context.metric(`${name}.p99`, percentile(durations, 0.99), 'ms');
  context.metric(`${name}.max`, durations[durations.length - 1] ?? 0, 'ms');

  for (const key of Object.keys(EMPTY_COUNTS) as (keyof MutationCounts)[]) {
    const mutationMean = samples.reduce((sum, sample) => sum + sample.mutations[key], 0)
      / Math.max(1, samples.length);
    context.metric(`${name}.native.${key}.mean`, mutationMean, 'count');
  }
}

function benchmarkMount(context: ScenarioContext, size: number, sampleCount: number): void {
  const samples: Sample[] = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const rows = makeRows(size);
    resetNativeBridgeForTests();
    const bridge = new RecordingBridge();
    const host = installNativeBridge(bridge);
    const mark = bridge.mark();
    const start = context.now();
    const disposeRender = renderApp(() => (
      <View>
        <For each={rows}>
          {(row) => <KeyedRow row={row} />}
        </For>
      </View>
    ));
    flush();
    const durationMs = context.now() - start;
    const mutations = bridge.countsSince(mark);

    const listNode = host.root.children[0];
    context.assert(
      `mount ${size} sample ${sampleIndex + 1} has exact row cardinality`,
      listNode?.children.length === size,
      `native=${listNode?.children.length ?? -1}`,
    );

    samples.push({ durationMs, mutations });
    disposeRender();
    resetNativeBridgeForTests();
  }

  emitSampleMetrics(context, `mount-${size}`, samples);
}

function benchmarkKeyedOperation(
  context: ScenarioContext,
  name: string,
  size: number,
  sampleCount: number,
  operate: (fixture: ListFixture, rows: readonly Row[], sampleIndex: number) => readonly Row[],
  restore: (fixture: ListFixture, baseline: readonly Row[]) => void,
): void {
  const baseline = makeRows(size);
  const fixture = mountList('keyed', baseline);
  const samples: Sample[] = [];

  try {
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const mark = fixture.bridge.mark();
      const start = context.now();
      const next = operate(fixture, baseline, sampleIndex);
      const durationMs = context.now() - start;
      samples.push({ durationMs, mutations: fixture.bridge.countsSince(mark) });
      context.assert(
        `${name} sample ${sampleIndex + 1} preserves expected cardinality`,
        fixture.listNode.children.length === next.length,
        `native=${fixture.listNode.children.length} data=${next.length}`,
      );
      restore(fixture, baseline);
    }
  } finally {
    fixture.dispose();
  }

  emitSampleMetrics(context, name, samples);
}

function runBenchmarks(context: ScenarioContext): void {
  benchmarkMount(context, 1_000, 7);
  benchmarkMount(context, 10_000, 5);

  benchmarkKeyedOperation(
    context,
    'insert-middle-1k',
    1_000,
    11,
    (fixture, rows, sampleIndex) => {
      const inserted = makeRow(1_000_000 + sampleIndex);
      const middle = Math.floor(rows.length / 2);
      const next = [...rows.slice(0, middle), inserted, ...rows.slice(middle)];
      fixture.setRows(next);
      return next;
    },
    (fixture, baseline) => fixture.setRows(baseline),
  );

  benchmarkKeyedOperation(
    context,
    'remove-middle-1k',
    1_000,
    11,
    (fixture, rows) => {
      const middle = Math.floor(rows.length / 2);
      const next = [...rows.slice(0, middle), ...rows.slice(middle + 1)];
      fixture.setRows(next);
      return next;
    },
    (fixture, baseline) => fixture.setRows(baseline),
  );

  {
    const rows = makeRows(1_000);
    const fixture = mountList('keyed', rows);
    const samples: Sample[] = [];
    try {
      for (let sampleIndex = 0; sampleIndex < 11; sampleIndex += 1) {
        const beforeIds = new Set(rowNodeIds(fixture));
        const mark = fixture.bridge.mark();
        const start = context.now();
        fixture.setRows([...fixture.rows()].reverse());
        const durationMs = context.now() - start;
        const afterIds = new Set(rowNodeIds(fixture));
        context.assert(
          `reverse-1k sample ${sampleIndex + 1} preserves all native identities`,
          beforeIds.size === afterIds.size && [...beforeIds].every(id => afterIds.has(id)),
        );
        samples.push({ durationMs, mutations: fixture.bridge.countsSince(mark) });
      }
    } finally {
      fixture.dispose();
    }
    emitSampleMetrics(context, 'reverse-1k', samples);
  }

  {
    const rows = makeRows(1_000);
    const ascending = [...rows];
    const descending = [...rows].reverse();
    const fixture = mountList('keyed', descending);
    const samples: Sample[] = [];
    try {
      for (let sampleIndex = 0; sampleIndex < 11; sampleIndex += 1) {
        const next = sampleIndex % 2 === 0 ? ascending : descending;
        const mark = fixture.bridge.mark();
        const start = context.now();
        fixture.setRows(next);
        const durationMs = context.now() - start;
        samples.push({ durationMs, mutations: fixture.bridge.countsSince(mark) });
      }
    } finally {
      fixture.dispose();
    }
    emitSampleMetrics(context, 'sort-1k', samples);
  }

  {
    const rows = makeRows(10_000);
    const fixture = mountList('keyed', rows);
    const sparseSamples: Sample[] = [];
    const denseSamples: Sample[] = [];

    try {
      for (let sampleIndex = 0; sampleIndex < 11; sampleIndex += 1) {
        const row = rows[(sampleIndex * 911) % rows.length]!;
        const mark = fixture.bridge.mark();
        const start = context.now();
        row.setLabel(`sparse-${sampleIndex}-${row.id}`);
        flush();
        const durationMs = context.now() - start;
        const mutations = fixture.bridge.countsSince(mark);
        context.assert(
          `sparse-update-10k sample ${sampleIndex + 1} is exactly one replaceText`,
          sameCounts(mutations, {
            createElement: 0,
            createTextNode: 0,
            replaceText: 1,
            insertNode: 0,
            removeNode: 0,
          }),
          countsDetail(mutations),
        );
        sparseSamples.push({ durationMs, mutations });
      }

      for (let sampleIndex = 0; sampleIndex < 11; sampleIndex += 1) {
        const startIndex = (sampleIndex * 613) % (rows.length - 100);
        const mark = fixture.bridge.mark();
        const start = context.now();
        for (let offset = 0; offset < 100; offset += 1) {
          const row = rows[startIndex + offset]!;
          row.setLabel(`dense-${sampleIndex}-${row.id}`);
        }
        flush();
        const durationMs = context.now() - start;
        const mutations = fixture.bridge.countsSince(mark);
        context.assert(
          `dense-update-100-of-10k sample ${sampleIndex + 1} is exactly 100 replaceText mutations`,
          sameCounts(mutations, {
            createElement: 0,
            createTextNode: 0,
            replaceText: 100,
            insertNode: 0,
            removeNode: 0,
          }),
          countsDetail(mutations),
        );
        denseSamples.push({ durationMs, mutations });
      }
    } finally {
      fixture.dispose();
    }

    emitSampleMetrics(context, 'sparse-update-1-of-10k', sparseSamples);
    emitSampleMetrics(context, 'dense-update-100-of-10k', denseSamples);
  }

  {
    const rows = makeRows(10_000);
    const filtered = rows.filter(row => row.id % 2 === 0);
    const fixture = mountList('keyed', rows);
    const filterSamples: Sample[] = [];
    const expandSamples: Sample[] = [];

    try {
      for (let sampleIndex = 0; sampleIndex < 5; sampleIndex += 1) {
        const fullIdentity = identityByLogicalId(fixture, rows);
        let mark = fixture.bridge.mark();
        let start = context.now();
        fixture.setRows(filtered);
        let durationMs = context.now() - start;
        let mutations = fixture.bridge.countsSince(mark);
        context.assert(
          `filter-10k-to-5k sample ${sampleIndex + 1} preserves all survivor identities`,
          filtered.every((row, index) => fixture.listNode.children[index]?.id === fullIdentity.get(row.id)),
        );
        context.assert(
          `filter-10k-to-5k sample ${sampleIndex + 1} removes exactly 5000 rows`,
          sameCounts(mutations, {
            createElement: 0,
            createTextNode: 0,
            replaceText: 0,
            insertNode: 0,
            removeNode: 5_000,
          }),
          countsDetail(mutations),
        );
        filterSamples.push({ durationMs, mutations });

        const survivorIdentity = identityByLogicalId(fixture, filtered);
        mark = fixture.bridge.mark();
        start = context.now();
        fixture.setRows(rows);
        durationMs = context.now() - start;
        mutations = fixture.bridge.countsSince(mark);
        const expandedIdentity = identityByLogicalId(fixture, rows);
        context.assert(
          `expand-5k-to-10k sample ${sampleIndex + 1} preserves survivor identities`,
          filtered.every(row => expandedIdentity.get(row.id) === survivorIdentity.get(row.id)),
        );
        context.assert(
          `expand-5k-to-10k sample ${sampleIndex + 1} has exact cardinality with no ghost rows`,
          fixture.listNode.children.length === 10_000,
        );
        context.assert(
          `expand-5k-to-10k sample ${sampleIndex + 1} recreates exactly the filtered-out row subtrees`,
          sameCounts(mutations, {
            createElement: 10_000,
            createTextNode: 5_000,
            replaceText: 5_000,
            setProperty: 0,
            setEventEnabled: 0,
          }),
          countsDetail(mutations),
        );
        context.assert(
          `expand-5k-to-10k sample ${sampleIndex + 1} inserts every recreated row subtree`,
          mutations.insertNode >= 15_000,
          countsDetail(mutations),
        );
        expandSamples.push({ durationMs, mutations });
      }
    } finally {
      fixture.dispose();
    }

    emitSampleMetrics(context, 'filter-10k-to-5k', filterSamples);
    emitSampleMetrics(context, 'expand-5k-to-10k', expandSamples);
  }
}

export const scenario: ScenarioDefinition = {
  id: 'lists-core',
  title: 'Solid 2 native list identity, mutation, and scale conformance',
  workstream: 'lists',
  kind: 'hybrid',
  run(context) {
    runKeyedConformance(context);
    runPositionalConformance(context);
    runRepeatConformance(context);
    runBenchmarks(context);
  },
};