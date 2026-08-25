import type { StingNativeBridge } from '@stingjs/core';
import { Text, View } from '@stingjs/native';
import { renderApp } from '@stingjs/solid';
import {
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
} from 'solid-js';
import type {
  ScenarioContext,
  ScenarioDefinition,
} from '../../harness/types.js';

const FANOUT_SIZES = [1, 10, 100, 1_000, 10_000] as const;
const FANOUT_BENCHMARK_ITERATIONS: Record<(typeof FANOUT_SIZES)[number], number> = {
  1: 5_000,
  10: 2_000,
  100: 500,
  1_000: 100,
  10_000: 10,
};
const BENCHMARK_SAMPLES = 15;
const INDEPENDENT_SIGNAL_COUNT = 10_000;
const SPARSE_TARGET = 4_281;
const DENSE_TARGETS = Array.from(
  { length: 100 },
  (_, index) => (SPARSE_TARGET + index * 97) % INDEPENDENT_SIGNAL_COUNT,
);

interface NativeMutationCounts {
  createElement: number;
  createTextNode: number;
  replaceText: number;
  setProperty: number;
  insertNode: number;
  removeNode: number;
  setEventEnabled: number;
}

function emptyNativeMutationCounts(): NativeMutationCounts {
  return {
    createElement: 0,
    createTextNode: 0,
    replaceText: 0,
    setProperty: 0,
    insertNode: 0,
    removeNode: 0,
    setEventEnabled: 0,
  };
}

function resetNativeMutationCounts(counts: NativeMutationCounts): void {
  const empty = emptyNativeMutationCounts();
  for (const key of Object.keys(empty) as (keyof NativeMutationCounts)[]) {
    counts[key] = 0;
  }
}

function unrelatedNativeMutationCount(counts: NativeMutationCounts): number {
  return (
    counts.createElement +
    counts.createTextNode +
    counts.setProperty +
    counts.insertNode +
    counts.removeNode +
    counts.setEventEnabled
  );
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

function recordDistribution(
  context: ScenarioContext,
  prefix: string,
  values: readonly number[],
  unit: string,
): void {
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);

  context.metric(`${prefix}.samples`, sorted.length, 'count');
  context.metric(`${prefix}.min`, sorted[0] ?? 0, unit);
  context.metric(`${prefix}.mean`, sorted.length === 0 ? 0 : sum / sorted.length, unit);
  context.metric(`${prefix}.p50`, percentile(sorted, 0.5), unit);
  context.metric(`${prefix}.p95`, percentile(sorted, 0.95), unit);
  context.metric(`${prefix}.p99`, percentile(sorted, 0.99), unit);
  context.metric(`${prefix}.max`, sorted.at(-1) ?? 0, unit);
}

function testMemoChain(context: ScenarioContext): void {
  let dispose = () => {};
  let setSource!: (value: number) => number;
  let readSource!: () => number;
  let observed = -1;
  let applyCount = 0;
  const recomputes = Array.from({ length: 32 }, () => 0);

  createRoot(rootDispose => {
    dispose = rootDispose;
    const [source, set] = createSignal(1);
    readSource = source;
    setSource = set;

    let read: () => number = source;
    for (let index = 0; index < recomputes.length; index += 1) {
      const previous = read;
      read = createMemo(() => {
        recomputes[index] = (recomputes[index] ?? 0) + 1;
        return previous() + 1;
      });
    }

    createRenderEffect(read, value => {
      observed = value;
      applyCount += 1;
    });
  });

  try {
    flush();
    context.assert('32-deep memo chain initializes correctly', observed === 33);

    recomputes.fill(0);
    applyCount = 0;
    setSource(5);

    context.assert('source reads expose the written value before flush', readSource() === 5);
    context.assert('render application remains batched before flush', observed === 33);

    flush();

    context.assert('32-deep memo chain settles to the correct value', observed === 37);
    context.assert(
      'every memo in the chain recomputes exactly once',
      recomputes.every(count => count === 1),
      `recompute counts=${JSON.stringify(recomputes)}`,
    );
    context.assert('memo-chain subscriber applies exactly once', applyCount === 1);

    recomputes.fill(0);
    applyCount = 0;
    setSource(5);
    flush();
    context.assert(
      'equal signal writes do not invalidate the memo chain',
      recomputes.every(count => count === 0) && applyCount === 0,
    );
  } finally {
    dispose();
  }
}

function testDiamondGraph(context: ScenarioContext): void {
  let dispose = () => {};
  let setSource!: (value: number) => number;
  let observed = -1;
  let leftRuns = 0;
  let rightRuns = 0;
  let joinRuns = 0;
  let applyCount = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    const [source, set] = createSignal(1);
    setSource = set;

    const left = createMemo(() => {
      leftRuns += 1;
      return source() * 2;
    });
    const right = createMemo(() => {
      rightRuns += 1;
      return source() + 3;
    });
    const joined = createMemo(() => {
      joinRuns += 1;
      return left() + right();
    });

    createRenderEffect(joined, value => {
      observed = value;
      applyCount += 1;
    });
  });

  try {
    flush();
    context.assert('diamond graph initializes correctly', observed === 6);

    leftRuns = 0;
    rightRuns = 0;
    joinRuns = 0;
    applyCount = 0;

    setSource(2);
    flush();

    context.assert('diamond graph settles to the correct value', observed === 9);
    context.assert('diamond left branch recomputes once', leftRuns === 1);
    context.assert('diamond right branch recomputes once', rightRuns === 1);
    context.assert('diamond join recomputes once', joinRuns === 1);
    context.assert('diamond subscriber applies once', applyCount === 1);
  } finally {
    dispose();
  }
}

function testDynamicDependencies(context: ScenarioContext): void {
  let dispose = () => {};
  let chooseLeft!: (value: boolean) => boolean;
  let setLeft!: (value: number) => number;
  let setRight!: (value: number) => number;
  let observed = -1;
  let applyCount = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    const [useLeft, setUseLeft] = createSignal(true);
    const [left, updateLeft] = createSignal(10);
    const [right, updateRight] = createSignal(20);
    chooseLeft = setUseLeft;
    setLeft = updateLeft;
    setRight = updateRight;

    const selected = createMemo(() => (useLeft() ? left() : right()));
    createRenderEffect(selected, value => {
      observed = value;
      applyCount += 1;
    });
  });

  try {
    flush();
    context.assert('dynamic dependency starts on the selected branch', observed === 10);

    applyCount = 0;
    setRight(21);
    flush();
    context.assert('inactive dependency does not notify subscribers', applyCount === 0 && observed === 10);

    setLeft(11);
    flush();
    context.assert('active dependency updates the subscriber once', applyCount === 1 && observed === 11);

    applyCount = 0;
    chooseLeft(false);
    flush();
    context.assert('dynamic dependency can switch branches', applyCount === 1 && observed === 21);

    applyCount = 0;
    setLeft(12);
    flush();
    context.assert('removed dependency stays unsubscribed', applyCount === 0 && observed === 21);

    setRight(22);
    flush();
    context.assert('new active dependency updates exactly once', applyCount === 1 && observed === 22);
  } finally {
    dispose();
  }
}

function testEquality(context: ScenarioContext): void {
  let dispose = () => {};
  let setCompared!: (value: { id: number; label: string }) => { id: number; label: string };
  let setAlways!: (value: number) => number;
  let setParitySource!: (value: number) => number;
  let comparedApplies = 0;
  let alwaysApplies = 0;
  let parityMemoRuns = 0;
  let parityApplies = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;

    const [compared, updateCompared] = createSignal(
      { id: 1, label: 'alpha' },
      {
        equals: (previous, next) =>
          previous.id === next.id && previous.label === next.label,
      },
    );
    setCompared = updateCompared;
    createRenderEffect(
      () => compared().label,
      () => {
        comparedApplies += 1;
      },
    );

    const [always, updateAlways] = createSignal(1, { equals: false });
    setAlways = updateAlways;
    createRenderEffect(always, () => {
      alwaysApplies += 1;
    });

    const [paritySource, updateParitySource] = createSignal(1);
    setParitySource = updateParitySource;
    const parity = createMemo(() => {
      parityMemoRuns += 1;
      return paritySource() % 2;
    });
    createRenderEffect(parity, () => {
      parityApplies += 1;
    });
  });

  try {
    flush();
    comparedApplies = 0;
    alwaysApplies = 0;
    parityMemoRuns = 0;
    parityApplies = 0;

    setCompared({ id: 1, label: 'alpha' });
    flush();
    context.assert('custom signal comparator suppresses equal writes', comparedApplies === 0);

    setCompared({ id: 1, label: 'beta' });
    flush();
    context.assert('custom signal comparator propagates unequal writes', comparedApplies === 1);

    setAlways(1);
    flush();
    context.assert('equals:false forces equal signal writes to propagate', alwaysApplies === 1);

    setParitySource(3);
    flush();
    context.assert('memo recomputes when its source changes', parityMemoRuns === 1);
    context.assert('memo equality suppresses unchanged downstream values', parityApplies === 0);
  } finally {
    dispose();
  }
}

async function testBatchingAndFlush(context: ScenarioContext): Promise<void> {
  let dispose = () => {};
  let readValue!: () => number;
  let setValue!: (value: number) => number;
  let applied = -1;
  let applyCount = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    const [value, set] = createSignal(0);
    readValue = value;
    setValue = set;
    createRenderEffect(value, next => {
      applied = next;
      applyCount += 1;
    });
  });

  try {
    flush();
    applyCount = 0;

    setValue(1);
    context.assert('signal getter observes a pending write immediately', readValue() === 1);
    context.assert('render application waits for the automatic batch boundary', applied === 0);

    await settleMicrotasks();
    context.assert('microtask boundary automatically settles pending work', applied === 1 && applyCount === 1);

    applyCount = 0;
    setValue(2);
    setValue(3);
    setValue(4);
    context.assert('multiple writes stay deferred before microtask settlement', applied === 1);
    await settleMicrotasks();
    context.assert('multiple writes in one turn coalesce to one application', applied === 4 && applyCount === 1);

    applyCount = 0;
    setValue(5);
    context.assert('explicit flush test has pending work before flush', applied === 4);
    flush();
    context.assert('flush settles the graph synchronously', applied === 5 && applyCount === 1);
  } finally {
    dispose();
  }

  let disposeNested = () => {};
  let readA!: () => number;
  let readB!: () => number;
  let updateA!: (value: number | ((previous: number) => number)) => number;
  let updateB!: (value: number | ((previous: number) => number)) => number;
  let observedSum = -1;
  let sumApplies = 0;

  createRoot(rootDispose => {
    disposeNested = rootDispose;
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    readA = a;
    readB = b;
    updateA = setA;
    updateB = setB;
    const sum = createMemo(() => a() + b());
    createRenderEffect(sum, value => {
      observedSum = value;
      sumApplies += 1;
    });
  });

  try {
    flush();
    sumApplies = 0;

    updateA(previous => {
      updateB(current => current + 10);
      return previous + 1;
    });

    context.assert('nested writes update source getters before settlement', readA() === 2 && readB() === 12);
    context.assert('nested writes preserve the previously applied value before flush', observedSum === 3);
    flush();
    context.assert('nested writes settle to one consistent graph state', observedSum === 14);
    context.assert('nested writes produce one downstream application', sumApplies === 1);
  } finally {
    disposeNested();
  }
}

function testFanoutCorrectness(context: ScenarioContext): void {
  for (const size of FANOUT_SIZES) {
    let dispose = () => {};
    let setValue!: (value: number) => number;
    let applies = 0;

    createRoot(rootDispose => {
      dispose = rootDispose;
      const [value, set] = createSignal(0);
      setValue = set;
      for (let index = 0; index < size; index += 1) {
        createRenderEffect(value, () => {
          applies += 1;
        });
      }
    });

    try {
      flush();
      applies = 0;
      setValue(1);
      flush();
      context.assert(
        `one signal fans out to exactly ${size.toLocaleString()} subscribers`,
        applies === size,
        `expected=${size} actual=${applies}`,
      );
    } finally {
      dispose();
    }
  }
}

function testIndependentSignals(context: ScenarioContext): void {
  let dispose = () => {};
  const setters: Array<(updater: (previous: number) => number) => number> = [];
  let applies = 0;

  createRoot(rootDispose => {
    dispose = rootDispose;
    for (let index = 0; index < INDEPENDENT_SIGNAL_COUNT; index += 1) {
      const [revision, setRevision] = createSignal(0);
      setters.push(setRevision);
      createRenderEffect(revision, () => {
        applies += 1;
      });
    }
  });

  const setterAt = (index: number) => {
    const setter = setters[index];
    if (!setter) throw new RangeError(`missing independent signal ${index}`);
    return setter;
  };

  try {
    flush();
    applies = 0;

    setterAt(SPARSE_TARGET)(previous => previous + 1);
    flush();
    context.assert('1-of-10K independent signal update notifies exactly one subscriber', applies === 1);

    applies = 0;
    for (const index of DENSE_TARGETS) {
      setterAt(index)(previous => previous + 1);
    }
    flush();
    context.assert('100-of-10K independent signal update notifies exactly 100 subscribers', applies === 100);
  } finally {
    dispose();
  }
}

function benchmarkFanout(context: ScenarioContext): void {
  for (const size of FANOUT_SIZES) {
    const iterations = FANOUT_BENCHMARK_ITERATIONS[size];
    const durations: number[] = [];
    let allSamplesExact = true;

    for (let sample = 0; sample < BENCHMARK_SAMPLES; sample += 1) {
      let dispose = () => {};
      let setValue!: (value: number) => number;
      let applies = 0;

      createRoot(rootDispose => {
        dispose = rootDispose;
        const [value, set] = createSignal(0);
        setValue = set;
        for (let index = 0; index < size; index += 1) {
          createRenderEffect(value, () => {
            applies += 1;
          });
        }
      });

      try {
        flush();
        applies = 0;
        const start = context.now();
        for (let iteration = 0; iteration < iterations; iteration += 1) {
          setValue(iteration + 1);
          flush();
        }
        const elapsed = context.now() - start;
        durations.push(elapsed / iterations);
        allSamplesExact &&= applies === size * iterations;
      } finally {
        dispose();
      }
    }

    context.assert(
      `fanout-${size} benchmark preserves exact subscriber count in every sample`,
      allSamplesExact,
    );
    context.metric(`fanout-${size}.subscribers`, size, 'count');
    context.metric(`fanout-${size}.iterations-per-sample`, iterations, 'count');
    recordDistribution(context, `fanout-${size}.update`, durations, 'ms/update');
  }
}

function installMutationRecorder(bridge: StingNativeBridge): {
  counts: NativeMutationCounts;
  restore(): void;
} {
  const counts = emptyNativeMutationCounts();
  const originals = {
    createElement: bridge.createElement,
    createTextNode: bridge.createTextNode,
    replaceText: bridge.replaceText,
    setProperty: bridge.setProperty,
    insertNode: bridge.insertNode,
    removeNode: bridge.removeNode,
    setEventEnabled: bridge.setEventEnabled,
  };

  bridge.createElement = (id, type) => {
    counts.createElement += 1;
    originals.createElement.call(bridge, id, type);
  };
  bridge.createTextNode = (id, value) => {
    counts.createTextNode += 1;
    originals.createTextNode.call(bridge, id, value);
  };
  bridge.replaceText = (id, value) => {
    counts.replaceText += 1;
    originals.replaceText.call(bridge, id, value);
  };
  bridge.setProperty = (id, name, valueJSON) => {
    counts.setProperty += 1;
    originals.setProperty.call(bridge, id, name, valueJSON);
  };
  bridge.insertNode = (parentId, nodeId, anchorId) => {
    counts.insertNode += 1;
    originals.insertNode.call(bridge, parentId, nodeId, anchorId);
  };
  bridge.removeNode = (parentId, nodeId) => {
    counts.removeNode += 1;
    originals.removeNode.call(bridge, parentId, nodeId);
  };
  bridge.setEventEnabled = (id, event, enabled) => {
    counts.setEventEnabled += 1;
    originals.setEventEnabled.call(bridge, id, event, enabled);
  };

  return {
    counts,
    restore() {
      bridge.createElement = originals.createElement;
      bridge.createTextNode = originals.createTextNode;
      bridge.replaceText = originals.replaceText;
      bridge.setProperty = originals.setProperty;
      bridge.insertNode = originals.insertNode;
      bridge.removeNode = originals.removeNode;
      bridge.setEventEnabled = originals.setEventEnabled;
    },
  };
}

function testNativeFanout(context: ScenarioContext): void {
  const bridge = globalThis.__stingNativeBridge;
  context.assert('native fanout probe has a Sting bridge', bridge !== undefined);
  if (!bridge) return;

  const recorder = installMutationRecorder(bridge);
  let dispose = () => {};

  try {
    const [value, setValue] = createSignal(0);
    dispose = renderApp(() => (
      <View>
        {Array.from({ length: 100 }, (_, index) => (
          <Text>
            Fanout {index}: {value()}
          </Text>
        ))}
      </View>
    ));
    flush();

    resetNativeMutationCounts(recorder.counts);
    setValue(1);
    context.assert('native fanout remains deferred before flush', recorder.counts.replaceText === 0);
    flush();

    context.assert(
      'one shared signal produces exactly 100 native text mutations',
      recorder.counts.replaceText === 100,
      `replaceText=${recorder.counts.replaceText}`,
    );
    context.assert(
      'native fanout produces zero unrelated mutations on the hot path',
      unrelatedNativeMutationCount(recorder.counts) === 0,
      `mutations=${JSON.stringify(recorder.counts)}`,
    );
    context.metric('native-fanout-100.replaceText', recorder.counts.replaceText, 'count');

    resetNativeMutationCounts(recorder.counts);
    setValue(1);
    flush();
    context.assert(
      'equal shared signal write produces no native text mutation',
      recorder.counts.replaceText === 0 && unrelatedNativeMutationCount(recorder.counts) === 0,
      `mutations=${JSON.stringify(recorder.counts)}`,
    );
  } finally {
    dispose();
    recorder.restore();
  }
}

export const scenario: ScenarioDefinition = {
  id: 'reactivity.graph-and-fanout',
  title: 'Solid 2 reactive graph, batching, fanout, and native mutation conformance',
  workstream: 'reactivity',
  kind: 'hybrid',
  async run(context) {
    testMemoChain(context);
    testDiamondGraph(context);
    testDynamicDependencies(context);
    testEquality(context);
    await testBatchingAndFlush(context);
    testFanoutCorrectness(context);
    testIndependentSignals(context);
    benchmarkFanout(context);
    testNativeFanout(context);
  },
};
