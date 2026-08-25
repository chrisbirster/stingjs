import {
  createProjection,
  createRenderEffect,
  createRoot,
  createStore,
  flush,
  storePath,
} from 'solid-js';
import { StingHost, type HostNode, type StingNativeBridge } from '@stingjs/core';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';

const LARGE_STORE_SIZE = 10_000;
const SPARSE_INDEX = 4_281;
const DENSE_UPDATE_COUNT = 100;
const SPARSE_SAMPLES = 25;
const DENSE_SAMPLES = 15;
const ARRAY_SAMPLES = 25;
const REORDER_SAMPLES = 8;
const PROJECTION_SAMPLES = 15;

export const storeScenarioControls = Object.freeze({
  largeStoreSize: LARGE_STORE_SIZE,
  sparseIndex: SPARSE_INDEX,
  denseUpdateCount: DENSE_UPDATE_COUNT,
  sparseSamples: SPARSE_SAMPLES,
  denseSamples: DENSE_SAMPLES,
  arraySamples: ARRAY_SAMPLES,
  reorderSamples: REORDER_SAMPLES,
  projectionSamples: PROJECTION_SAMPLES,
});

type UserRecord = {
  id: number;
  name: string;
  score: number;
  profile: {
    city?: string;
    flags: {
      active: boolean;
    };
  };
  tags: string[];
};

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
    let count = 0;
    for (const operation of this.operations) {
      if (operation.kind === kind) count += 1;
    }
    return count;
  }

  replacements(): Extract<NativeOperation, { kind: 'replaceText' }>[] {
    return this.operations.filter(
      (operation): operation is Extract<NativeOperation, { kind: 'replaceText' }> =>
        operation.kind === 'replaceText',
    );
  }

  structuralMutationCount(): number {
    return this.operations.filter(operation => operation.kind !== 'replaceText').length;
  }
}

function makeUser(id: number): UserRecord {
  return {
    id,
    name: `User ${id}`,
    score: id % 101,
    profile: {
      city: `City ${id % 17}`,
      flags: {
        active: id % 2 === 0,
      },
    },
    tags: [`group-${id % 11}`, `bucket-${id % 7}`],
  };
}

function makeUsers(count: number): UserRecord[] {
  return Array.from({ length: count }, (_, index) => makeUser(index));
}

function denseIndices(): number[] {
  const indices: number[] = [];
  for (let index = 0; index < DENSE_UPDATE_COUNT; index += 1) {
    indices.push((index * 97 + 13) % LARGE_STORE_SIZE);
  }
  return indices;
}

function withRoot<T>(run: () => T): T {
  let dispose: (() => void) | undefined;
  try {
    return createRoot(rootDispose => {
      dispose = rootDispose;
      return run();
    });
  } finally {
    dispose?.();
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function recordDistribution(context: ScenarioContext, prefix: string, samples: readonly number[]): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, sample) => sum + sample, 0);

  context.metric(`${prefix}.samples`, samples.length, 'count');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, 'ms');
  context.metric(`${prefix}.mean`, samples.length === 0 ? 0 : total / samples.length, 'ms');
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), 'ms');
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), 'ms');
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), 'ms');
  context.metric(`${prefix}.max`, sorted[sorted.length - 1] ?? 0, 'ms');
}

function assertOnlyExpectedReplacementIds(
  context: ScenarioContext,
  name: string,
  bridge: RecordingNativeBridge,
  expectedIds: readonly number[],
): void {
  const actualIds = bridge
    .replacements()
    .map(operation => operation.id)
    .sort((left, right) => left - right);
  const sortedExpected = [...expectedIds].sort((left, right) => left - right);
  const idsMatch =
    actualIds.length === sortedExpected.length &&
    actualIds.every((id, index) => id === sortedExpected[index]);

  context.assert(
    name,
    idsMatch,
    `expected replacement ids ${sortedExpected.join(',')}, got ${actualIds.join(',')}`,
  );
}

function runStoreApiConformance(context: ScenarioContext): void {
  withRoot(() => {
    const [state, setState] = createStore({
      title: 'initial',
      profile: {
        name: 'Ada',
        location: {
          city: 'London' as string | undefined,
        },
      },
      users: [makeUser(0), makeUser(1), makeUser(2)],
    });

    context.assert('createStore exposes initial scalar field', state.title === 'initial');
    context.assert('createStore exposes nested object field', state.profile.location.city === 'London');
    context.assert('createStore exposes nested array field', state.users[1]?.tags[0] === 'group-1');

    setState(draft => {
      draft.title = 'updated';
    });
    flush();
    context.assert('draft setter updates one top-level field', state.title === 'updated');

    setState(draft => {
      draft.profile.location.city = 'Paris';
      draft.users[1]!.profile.flags.active = true;
      draft.users[1]!.tags.push('draft-added');
    });
    flush();
    context.assert('draft setter updates deep object field', state.profile.location.city === 'Paris');
    context.assert('draft setter updates deep array/object field', state.users[1]?.profile.flags.active === true);
    context.assert('draft setter can push into nested array', state.users[1]?.tags.at(-1) === 'draft-added');

    setState(draft => {
      draft.users.push(makeUser(3));
    });
    flush();
    context.assert('store array push appends one item', state.users.length === 4 && state.users[3]?.id === 3);

    setState(draft => {
      draft.users.splice(1, 1);
    });
    flush();
    context.assert(
      'store array splice removes exact item',
      state.users.length === 3 && state.users.map(user => user.id).join(',') === '0,2,3',
    );

    setState(draft => {
      Reflect.deleteProperty(draft.profile.location, 'city');
    });
    flush();
    context.assert(
      'draft setter deletes nested field',
      !Object.prototype.hasOwnProperty.call(state.profile.location, 'city'),
    );

    setState(draft => {
      draft.users.reverse();
    });
    flush();
    context.assert(
      'store array reorder preserves records in new order',
      state.users.map(user => user.id).join(',') === '3,2,0',
    );

    setState(storePath('profile', 'name', 'Grace'));
    flush();
    context.assert('storePath updates nested object field', state.profile.name === 'Grace');

    setState(storePath('users', 1, 'name', 'Path Updated'));
    flush();
    context.assert('storePath supports numeric array index', state.users[1]?.name === 'Path Updated');
  });
}

type DerivedSummary = {
  fullName: string;
  score: number;
};

function runDerivedStoreConformance(context: ScenarioContext): void {
  withRoot(() => {
    const [source, setSource] = createStore({
      first: 'Ada',
      last: 'Lovelace',
      scores: [10, 20],
    });
    let derivedRuns = 0;

    const [derived] = createStore<DerivedSummary>(
      draft => {
        derivedRuns += 1;
        draft.fullName = `${source.first} ${source.last}`;
        draft.score = source.scores[0]! + source.scores[1]!;
      },
      { fullName: '', score: 0 },
    );

    flush();
    context.assert('derived createStore(fn) computes initial object', derived.fullName === 'Ada Lovelace');
    context.assert('derived createStore(fn) computes initial nested read', derived.score === 30);

    const runsBeforeUpdate = derivedRuns;
    setSource(draft => {
      draft.first = 'Grace';
      draft.scores[1] = 32;
    });
    flush();

    context.assert('derived createStore(fn) follows source update', derived.fullName === 'Grace Lovelace');
    context.assert('derived createStore(fn) follows nested array source update', derived.score === 42);
    context.assert(
      'derived createStore(fn) recomputes after source mutation',
      derivedRuns > runsBeforeUpdate,
      `runs before=${runsBeforeUpdate}, after=${derivedRuns}`,
    );
  });
}

type ProjectionState = {
  selectedName: string;
  selectedScore: number;
};

function runProjectionConformance(context: ScenarioContext): void {
  withRoot(() => {
    const [source, setSource] = createStore({
      selected: 1,
      users: [makeUser(0), makeUser(1), makeUser(2)],
    });
    let projectionRuns = 0;

    const projection = createProjection<ProjectionState>(
      draft => {
        projectionRuns += 1;
        const selected = source.users[source.selected]!;
        draft.selectedName = selected.name;
        draft.selectedScore = selected.score;
      },
      { selectedName: '', selectedScore: 0 },
    );

    flush();
    context.assert('createProjection computes initial selected record', projection.selectedName === 'User 1');

    const beforeNameUpdate = projectionRuns;
    setSource(draft => {
      draft.users[1]!.name = 'Projected User';
    });
    flush();
    context.assert('createProjection recomputes deep dependency', projection.selectedName === 'Projected User');
    context.assert(
      'createProjection recomputed after deep dependency update',
      projectionRuns > beforeNameUpdate,
      `runs before=${beforeNameUpdate}, after=${projectionRuns}`,
    );

    setSource(draft => {
      draft.selected = 2;
    });
    flush();
    context.assert('createProjection follows selector/index dependency', projection.selectedName === 'User 2');
  });
}

type NativeStoreFixture = {
  state: { users: readonly UserRecord[] };
  setState: ReturnType<typeof createStore<{ users: UserRecord[] }>>[1];
  bridge: RecordingNativeBridge;
  container: HostNode;
  textNodes: HostNode[];
};

function createNativeStoreFixture(): NativeStoreFixture {
  const [state, setState] = createStore({ users: makeUsers(LARGE_STORE_SIZE) });
  const bridge = new RecordingNativeBridge();
  const host = new StingHost(bridge);
  const container = host.createElement('View');
  host.insertNode(host.root, container);
  const textNodes: HostNode[] = [];

  for (let index = 0; index < state.users.length; index += 1) {
    const node = host.createTextNode(state.users[index]!.name);
    host.insertNode(container, node);
    textNodes.push(node);
    createRenderEffect(
      () => state.users[index]!.name,
      value => {
        host.replaceText(node, value);
      },
    );
  }
  flush();
  bridge.clear();

  return { state, setState, bridge, container, textNodes };
}

function runLargeStoreNativeConformanceAndBenchmarks(context: ScenarioContext): void {
  withRoot(() => {
    const fixture = createNativeStoreFixture();
    const { state, setState, bridge, container, textNodes } = fixture;
    const targetNode = textNodes[SPARSE_INDEX]!;
    const unrelatedNode = textNodes[SPARSE_INDEX - 1]!;
    const targetIdentity = targetNode;
    const unrelatedIdentity = unrelatedNode;

    setState(draft => {
      draft.users[SPARSE_INDEX]!.name = 'Sparse conformance update';
    });
    flush();

    context.assert(
      '10K sparse store mutation updates target value',
      state.users[SPARSE_INDEX]?.name === 'Sparse conformance update',
    );
    context.assert(
      '10K sparse store mutation emits exactly one native replaceText',
      bridge.count('replaceText') === 1,
      `replaceText=${bridge.count('replaceText')}`,
    );
    context.assert(
      '10K sparse store mutation emits no structural/property/event replay',
      bridge.structuralMutationCount() === 0,
      `non-replace operations=${bridge.structuralMutationCount()}`,
    );
    assertOnlyExpectedReplacementIds(
      context,
      '10K sparse store mutation targets exact dependent native text node',
      bridge,
      [targetNode.id],
    );
    context.assert('10K sparse update preserves target native identity', textNodes[SPARSE_INDEX] === targetIdentity);
    context.assert(
      '10K sparse update preserves unrelated native identity',
      textNodes[SPARSE_INDEX - 1] === unrelatedIdentity,
    );
    context.assert(
      '10K sparse update creates no ghost nodes',
      container.children.length === LARGE_STORE_SIZE && container.children.every(node => node.parent === container),
      `children=${container.children.length}`,
    );
    context.metric('stores.10k.sparse.native-mutations', bridge.count('replaceText'), 'count');

    bridge.clear();
    const dense = denseIndices();
    const expectedDenseIds = dense.map(index => textNodes[index]!.id);
    setState(draft => {
      for (const index of dense) {
        draft.users[index]!.name = `Dense conformance ${index}`;
      }
    });
    flush();

    context.assert(
      '100-of-10K field update emits exactly 100 native replaceText mutations',
      bridge.count('replaceText') === DENSE_UPDATE_COUNT,
      `replaceText=${bridge.count('replaceText')}`,
    );
    context.assert(
      '100-of-10K field update emits no structural/property/event replay',
      bridge.structuralMutationCount() === 0,
      `non-replace operations=${bridge.structuralMutationCount()}`,
    );
    assertOnlyExpectedReplacementIds(
      context,
      '100-of-10K field update touches only dependent native text nodes',
      bridge,
      expectedDenseIds,
    );
    context.assert(
      '100-of-10K update preserves 10K native child identities',
      container.children.length === LARGE_STORE_SIZE &&
        container.children.every((node, index) => node === textNodes[index]),
    );
    context.metric('stores.10k.dense-100.native-mutations', bridge.count('replaceText'), 'count');

    const sparseDurations: number[] = [];
    const sparseMutationCounts: number[] = [];
    let sparseStructuralReplay = 0;
    for (let sample = 0; sample < SPARSE_SAMPLES; sample += 1) {
      bridge.clear();
      const start = context.now();
      setState(draft => {
        draft.users[SPARSE_INDEX]!.name = `Sparse sample ${sample}`;
      });
      flush();
      sparseDurations.push(context.now() - start);
      sparseMutationCounts.push(bridge.count('replaceText'));
      sparseStructuralReplay += bridge.structuralMutationCount();
    }
    context.assert(
      'sparse benchmark preserves exactly one native mutation per sample',
      sparseMutationCounts.every(count => count === 1),
      `counts=${sparseMutationCounts.join(',')}`,
    );
    context.assert(
      'sparse benchmark has no structural/property/event replay',
      sparseStructuralReplay === 0,
      `unexpected operations=${sparseStructuralReplay}`,
    );
    recordDistribution(context, 'stores.10k.sparse-update', sparseDurations);
    context.metric('stores.10k.sparse-update.native-mutations-per-sample', 1, 'count');

    const denseDurations: number[] = [];
    const denseMutationCounts: number[] = [];
    let denseStructuralReplay = 0;
    for (let sample = 0; sample < DENSE_SAMPLES; sample += 1) {
      bridge.clear();
      const start = context.now();
      setState(draft => {
        for (const index of dense) {
          draft.users[index]!.name = `Dense sample ${sample}:${index}`;
        }
      });
      flush();
      denseDurations.push(context.now() - start);
      denseMutationCounts.push(bridge.count('replaceText'));
      denseStructuralReplay += bridge.structuralMutationCount();
    }
    context.assert(
      'dense benchmark preserves exactly 100 native mutations per sample',
      denseMutationCounts.every(count => count === DENSE_UPDATE_COUNT),
      `counts=${denseMutationCounts.join(',')}`,
    );
    context.assert(
      'dense benchmark has no structural/property/event replay',
      denseStructuralReplay === 0,
      `unexpected operations=${denseStructuralReplay}`,
    );
    recordDistribution(context, 'stores.10k.dense-100-update', denseDurations);
    context.metric(
      'stores.10k.dense-100-update.native-mutations-per-sample',
      DENSE_UPDATE_COUNT,
      'count',
    );
  });
}

function runArrayBenchmarks(context: ScenarioContext): void {
  withRoot(() => {
    const [items, setItems] = createStore(makeUsers(LARGE_STORE_SIZE));
    const appendDurations: number[] = [];
    const removeDurations: number[] = [];

    for (let sample = 0; sample < ARRAY_SAMPLES; sample += 1) {
      const appendedId = LARGE_STORE_SIZE + sample;
      let start = context.now();
      setItems(draft => {
        draft.push(makeUser(appendedId));
      });
      flush();
      appendDurations.push(context.now() - start);
      context.assert(
        `array append sample ${sample} preserves appended identity`,
        items.at(-1)?.id === appendedId,
      );

      start = context.now();
      setItems(draft => {
        draft.splice(draft.length - 1, 1);
      });
      flush();
      removeDurations.push(context.now() - start);
      context.assert(
        `array remove sample ${sample} restores baseline length`,
        items.length === LARGE_STORE_SIZE,
      );
    }

    recordDistribution(context, 'stores.array-append-10k', appendDurations);
    recordDistribution(context, 'stores.array-remove-10k', removeDurations);
  });

  withRoot(() => {
    const [items, setItems] = createStore(makeUsers(LARGE_STORE_SIZE));
    const reorderDurations: number[] = [];

    for (let sample = 0; sample < REORDER_SAMPLES; sample += 1) {
      const descending = sample % 2 === 0;
      const start = context.now();
      setItems(draft => {
        draft.sort((left, right) => (descending ? right.id - left.id : left.id - right.id));
      });
      flush();
      reorderDurations.push(context.now() - start);

      const expectedFirst = descending ? LARGE_STORE_SIZE - 1 : 0;
      const expectedLast = descending ? 0 : LARGE_STORE_SIZE - 1;
      context.assert(
        `array reorder sample ${sample} has expected first/last ids`,
        items[0]?.id === expectedFirst && items.at(-1)?.id === expectedLast,
        `first=${items[0]?.id}, last=${items.at(-1)?.id}`,
      );
    }

    recordDistribution(context, 'stores.array-sort-reorder-10k', reorderDurations);
  });
}

type ProjectionBenchmarkState = {
  totalScore: number;
};

function runProjectionBenchmark(context: ScenarioContext): void {
  withRoot(() => {
    const [source, setSource] = createStore({ users: makeUsers(LARGE_STORE_SIZE) });
    let recomputations = 0;

    const projection = createProjection<ProjectionBenchmarkState>(
      draft => {
        recomputations += 1;
        let totalScore = 0;
        for (let index = 0; index < source.users.length; index += 1) {
          totalScore += source.users[index]!.score;
        }
        draft.totalScore = totalScore;
      },
      { totalScore: 0 },
    );

    flush();
    void projection.totalScore;

    const durations: number[] = [];
    const recomputationDeltas: number[] = [];
    for (let sample = 0; sample < PROJECTION_SAMPLES; sample += 1) {
      const runsBefore = recomputations;
      const start = context.now();
      setSource(draft => {
        draft.users[SPARSE_INDEX]!.score = 1_000 + sample;
      });
      flush();
      void projection.totalScore;
      durations.push(context.now() - start);
      recomputationDeltas.push(recomputations - runsBefore);
    }

    context.assert(
      'projection benchmark recomputes exactly once per source field update',
      recomputationDeltas.every(delta => delta === 1),
      `deltas=${recomputationDeltas.join(',')}`,
    );
    recordDistribution(context, 'stores.projection-recompute-10k', durations);
    context.metric(
      'stores.projection-recompute-10k.recomputations-per-sample',
      recomputationDeltas.reduce((sum, delta) => sum + delta, 0) / recomputationDeltas.length,
      'count',
    );
  });
}

export const scenario = {
  id: 'stores-and-projections',
  title: 'Solid 2 stores, projections, and 10K fine-grained native updates',
  workstream: 'stores',
  kind: 'hybrid',
  run(context) {
    runStoreApiConformance(context);
    runDerivedStoreConformance(context);
    runProjectionConformance(context);
    runLargeStoreNativeConformanceAndBenchmarks(context);
    runArrayBenchmarks(context);
    runProjectionBenchmark(context);
  },
} satisfies ScenarioDefinition;
