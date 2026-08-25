import { createMemo, createSignal, flush } from 'solid-js';
import { Text, View } from '@stingjs/native';
import { Errored, Loading, Reveal, render } from '@stingjs/solid';
import type { HostNode } from '@stingjs/core';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';
import {
  ControlledAsyncIterable,
  deferred,
  sampleStats,
  settleSolid,
  type Deferred,
} from './deterministic.js';
import {
  createTraceHost,
  directChildLabels,
  findNodeByLabel,
  mutationCounts,
  replayCountOnIds,
  requireNodeByLabel,
  textContent,
  type TraceHost,
  type TraceNativeBridge,
  type TraceOperation,
} from './nativeTrace.js';

type RevealMode = 'sequential' | 'together' | 'natural';

type MountedCase = TraceHost & {
  readonly disposeRender: () => void;
};

const BENCHMARK_SAMPLES = 32;

function AsyncText(props: {
  request: Deferred<string>;
  label: string;
  prefix?: string;
}): HostNode {
  const value = createMemo(() => props.request.promise);
  return (
    <Text accessibilityLabel={props.label}>
      {props.prefix ?? ''}{value()}
    </Text>
  );
}

function StreamText(props: {
  stream: ControlledAsyncIterable<string>;
  label: string;
}): HostNode {
  // This is intentionally the Promise-backed AsyncIterator form used by the
  // existing async-native cross-engine proof. It exercises Solid 2 streaming
  // without async-generator syntax, which the pinned Hermes V1 parser rejects.
  const value = createMemo<string>(() => props.stream);
  return <Text accessibilityLabel={props.label}>Stream: {value()}</Text>;
}

async function mountCase(code: () => HostNode): Promise<MountedCase> {
  const trace = createTraceHost();
  const disposeRender = render(code, trace.host.root);
  await settleSolid();
  return { ...trace, disposeRender };
}

function disposeCase(mounted: MountedCase): void {
  mounted.disposeRender();
  mounted.dispose();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertLabels(
  context: ScenarioContext,
  name: string,
  mounted: MountedCase,
  parentLabel: string,
  expected: readonly string[],
): void {
  const actual = directChildLabels(mounted.host, mounted.bridge, parentLabel);
  context.assert(
    name,
    sameStrings(actual, expected),
    `expected [${expected.join(', ')}], got [${actual.join(', ')}]`,
  );
}

function directMutationTrace(
  bridge: TraceNativeBridge,
  operations: readonly TraceOperation[],
  parentId: number,
): string[] {
  return bridge.structuralTrace(
    operations.filter(
      operation =>
        (operation.kind === 'insertNode' || operation.kind === 'removeNode') &&
        operation.parentId === parentId,
    ),
  );
}

function assertDirectMutationTrace(
  context: ScenarioContext,
  name: string,
  mounted: MountedCase,
  parentLabel: string,
  operations: readonly TraceOperation[],
  expected: readonly string[],
): void {
  const parent = requireNodeByLabel(mounted.host, mounted.bridge, parentLabel);
  const actual = directMutationTrace(mounted.bridge, operations, parent.id);
  context.assert(
    name,
    sameStrings(actual, expected),
    `expected [${expected.join(' | ')}], got [${actual.join(' | ')}]`,
  );
}

function assertNoReplayOnVisibleIds(
  context: ScenarioContext,
  name: string,
  operations: readonly TraceOperation[],
  ids: ReadonlySet<number>,
): void {
  const replayCount = replayCountOnIds(operations, ids);
  context.assert(name, replayCount === 0, `unexpected property/event replay count=${replayCount}`);
}

async function runSequential(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="sequential">
      <View accessibilityLabel="seq-group">
        <Loading fallback={<Text accessibilityLabel="seq-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="seq-a-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="seq-b-fallback">B loading</Text>}>
          <AsyncText request={b} label="seq-b-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="seq-c-fallback">C loading</Text>}>
          <AsyncText request={c} label="seq-c-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    assertLabels(context, 'sequential initially exposes every non-collapsed fallback', mounted, 'seq-group', [
      'seq-a-fallback',
      'seq-b-fallback',
      'seq-c-fallback',
    ]);

    const groupId = requireNodeByLabel(mounted.host, mounted.bridge, 'seq-group').id;
    const fallbackBId = requireNodeByLabel(mounted.host, mounted.bridge, 'seq-b-fallback').id;
    const fallbackCId = requireNodeByLabel(mounted.host, mounted.bridge, 'seq-c-fallback').id;

    let mark = mounted.bridge.mark();
    c.resolve('C');
    await settleSolid();
    let operations = mounted.bridge.since(mark);
    assertLabels(context, 'sequential holds a later ready branch behind the frontier', mounted, 'seq-group', [
      'seq-a-fallback',
      'seq-b-fallback',
      'seq-c-fallback',
    ]);
    context.assert(
      'late resolution performs no direct native replacement while held',
      directMutationTrace(mounted.bridge, operations, groupId).length === 0,
    );
    assertNoReplayOnVisibleIds(
      context,
      'late resolution does not replay properties/events on visible fallbacks',
      operations,
      new Set([fallbackBId, fallbackCId]),
    );

    mark = mounted.bridge.mark();
    a.resolve('A');
    await settleSolid();
    operations = mounted.bridge.since(mark);
    assertLabels(context, 'sequential releases only the ready prefix before the next pending slot', mounted, 'seq-group', [
      'seq-a-content',
      'seq-b-fallback',
      'seq-c-fallback',
    ]);
    assertDirectMutationTrace(
      context,
      'sequential first-frontier native replacement order is exact',
      mounted,
      'seq-group',
      operations,
      ['remove seq-group>seq-a-fallback', 'insert seq-group>seq-a-content before seq-b-fallback'],
    );
    context.assert(
      'sequential preserves later fallback native identity',
      requireNodeByLabel(mounted.host, mounted.bridge, 'seq-b-fallback').id === fallbackBId &&
        requireNodeByLabel(mounted.host, mounted.bridge, 'seq-c-fallback').id === fallbackCId,
    );
    assertNoReplayOnVisibleIds(
      context,
      'sequential frontier move does not replay properties/events on preserved siblings',
      operations,
      new Set([fallbackBId, fallbackCId]),
    );

    mark = mounted.bridge.mark();
    b.resolve('B');
    await settleSolid();
    operations = mounted.bridge.since(mark);
    assertLabels(context, 'sequential releases a previously-ready late branch after the frontier clears', mounted, 'seq-group', [
      'seq-a-content',
      'seq-b-content',
      'seq-c-content',
    ]);
    assertDirectMutationTrace(
      context,
      'sequential multi-release native ordering follows registration order',
      mounted,
      'seq-group',
      operations,
      [
        'remove seq-group>seq-b-fallback',
        'remove seq-group>seq-c-fallback',
        'insert seq-group>seq-b-content before end',
        'insert seq-group>seq-c-content before end',
      ],
    );
    context.assert(
      'sequential leaves no ghost fallback nodes',
      findNodeByLabel(mounted.host, mounted.bridge, 'seq-a-fallback') === undefined &&
        findNodeByLabel(mounted.host, mounted.bridge, 'seq-b-fallback') === undefined &&
        findNodeByLabel(mounted.host, mounted.bridge, 'seq-c-fallback') === undefined,
    );
  } finally {
    disposeCase(mounted);
  }
}

async function runCollapsedSequential(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="sequential" collapsed>
      <View accessibilityLabel="collapsed-group">
        <Loading fallback={<Text accessibilityLabel="collapsed-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="collapsed-a-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="collapsed-b-fallback">B loading</Text>}>
          <AsyncText request={b} label="collapsed-b-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="collapsed-c-fallback">C loading</Text>}>
          <AsyncText request={c} label="collapsed-c-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    assertLabels(context, 'collapsed sequential renders only the frontier fallback', mounted, 'collapsed-group', [
      'collapsed-a-fallback',
    ]);

    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'collapsed sequential keeps a ready tail slot suppressed', mounted, 'collapsed-group', [
      'collapsed-a-fallback',
    ]);

    let mark = mounted.bridge.mark();
    a.resolve('A');
    await settleSolid();
    let operations = mounted.bridge.since(mark);
    assertLabels(context, 'collapsed sequential advances to exactly one new frontier fallback', mounted, 'collapsed-group', [
      'collapsed-a-content',
      'collapsed-b-fallback',
    ]);
    assertDirectMutationTrace(
      context,
      'collapsed frontier expansion has exact direct insertion order',
      mounted,
      'collapsed-group',
      operations,
      [
        'remove collapsed-group>collapsed-a-fallback',
        'insert collapsed-group>collapsed-a-content before end',
        'insert collapsed-group>collapsed-b-fallback before end',
      ],
    );

    mark = mounted.bridge.mark();
    b.resolve('B');
    await settleSolid();
    operations = mounted.bridge.since(mark);
    assertLabels(context, 'collapsed sequential reveals ready tail when the frontier fully clears', mounted, 'collapsed-group', [
      'collapsed-a-content',
      'collapsed-b-content',
      'collapsed-c-content',
    ]);
    assertDirectMutationTrace(
      context,
      'collapsed final release has exact direct insertion order',
      mounted,
      'collapsed-group',
      operations,
      [
        'remove collapsed-group>collapsed-b-fallback',
        'insert collapsed-group>collapsed-b-content before end',
        'insert collapsed-group>collapsed-c-content before end',
      ],
    );
  } finally {
    disposeCase(mounted);
  }
}

async function runTogether(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="together" collapsed>
      <View accessibilityLabel="together-group">
        <Loading fallback={<Text accessibilityLabel="together-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="together-a-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="together-b-fallback">B loading</Text>}>
          <AsyncText request={b} label="together-b-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="together-c-fallback">C loading</Text>}>
          <AsyncText request={c} label="together-c-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    assertLabels(context, 'together ignores collapsed and exposes all fallbacks while incomplete', mounted, 'together-group', [
      'together-a-fallback',
      'together-b-fallback',
      'together-c-fallback',
    ]);

    c.resolve('C');
    await settleSolid();
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'together holds ready slots until every direct slot is minimally ready', mounted, 'together-group', [
      'together-a-fallback',
      'together-b-fallback',
      'together-c-fallback',
    ]);

    const mark = mounted.bridge.mark();
    b.resolve('B');
    await settleSolid();
    const operations = mounted.bridge.since(mark);
    assertLabels(context, 'together releases every direct slot cohesively', mounted, 'together-group', [
      'together-a-content',
      'together-b-content',
      'together-c-content',
    ]);
    assertDirectMutationTrace(
      context,
      'together cohesive native replacement order is exact',
      mounted,
      'together-group',
      operations,
      [
        'remove together-group>together-a-fallback',
        'remove together-group>together-b-fallback',
        'remove together-group>together-c-fallback',
        'insert together-group>together-a-content before end',
        'insert together-group>together-b-content before end',
        'insert together-group>together-c-content before end',
      ],
    );
  } finally {
    disposeCase(mounted);
  }
}

async function runNatural(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="natural" collapsed>
      <View accessibilityLabel="natural-group">
        <Loading fallback={<Text accessibilityLabel="natural-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="natural-a-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="natural-b-fallback">B loading</Text>}>
          <AsyncText request={b} label="natural-b-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="natural-c-fallback">C loading</Text>}>
          <AsyncText request={c} label="natural-c-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    assertLabels(context, 'natural ignores collapsed and initially exposes all fallbacks', mounted, 'natural-group', [
      'natural-a-fallback',
      'natural-b-fallback',
      'natural-c-fallback',
    ]);

    let mark = mounted.bridge.mark();
    c.resolve('C');
    await settleSolid();
    let operations = mounted.bridge.since(mark);
    assertLabels(context, 'natural reveals a later sibling independently', mounted, 'natural-group', [
      'natural-a-fallback',
      'natural-b-fallback',
      'natural-c-content',
    ]);
    assertDirectMutationTrace(
      context,
      'natural tail replacement order is exact',
      mounted,
      'natural-group',
      operations,
      ['remove natural-group>natural-c-fallback', 'insert natural-group>natural-c-content before end'],
    );

    const cId = requireNodeByLabel(mounted.host, mounted.bridge, 'natural-c-content').id;
    mark = mounted.bridge.mark();
    a.resolve('A');
    await settleSolid();
    operations = mounted.bridge.since(mark);
    assertLabels(context, 'natural independently reveals an earlier sibling without disturbing ready tail', mounted, 'natural-group', [
      'natural-a-content',
      'natural-b-fallback',
      'natural-c-content',
    ]);
    assertDirectMutationTrace(
      context,
      'natural head replacement order is exact',
      mounted,
      'natural-group',
      operations,
      ['remove natural-group>natural-a-fallback', 'insert natural-group>natural-a-content before natural-b-fallback'],
    );
    context.assert(
      'natural preserves already-revealed sibling native identity',
      requireNodeByLabel(mounted.host, mounted.bridge, 'natural-c-content').id === cId,
    );
    assertNoReplayOnVisibleIds(
      context,
      'natural sibling reveal does not replay properties/events on ready tail',
      operations,
      new Set([cId]),
    );

    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'natural eventually exposes all independently-ready content', mounted, 'natural-group', [
      'natural-a-content',
      'natural-b-content',
      'natural-c-content',
    ]);
  } finally {
    disposeCase(mounted);
  }
}

async function runNestedSequentialNatural(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const d = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="sequential">
      <View accessibilityLabel="nested-group">
        <Loading fallback={<Text accessibilityLabel="nested-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="nested-a-content" />
        </Loading>
        <Reveal order="natural">
          <Loading fallback={<Text accessibilityLabel="nested-b-fallback">B loading</Text>}>
            <AsyncText request={b} label="nested-b-content" />
          </Loading>
          <Loading fallback={<Text accessibilityLabel="nested-c-fallback">C loading</Text>}>
            <AsyncText request={c} label="nested-c-content" />
          </Loading>
        </Reveal>
        <Loading fallback={<Text accessibilityLabel="nested-d-fallback">D loading</Text>}>
          <AsyncText request={d} label="nested-d-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'outer sequential hold prevents nested natural from escaping early', mounted, 'nested-group', [
      'nested-a-fallback',
      'nested-b-fallback',
      'nested-c-fallback',
      'nested-d-fallback',
    ]);

    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'outer sequential releases nested Reveal as one composite frontier slot', mounted, 'nested-group', [
      'nested-a-content',
      'nested-b-fallback',
      'nested-c-content',
      'nested-d-fallback',
    ]);

    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'outer sequential advances past nested group only when the composite is fully ready', mounted, 'nested-group', [
      'nested-a-content',
      'nested-b-content',
      'nested-c-content',
      'nested-d-fallback',
    ]);

    d.resolve('D');
    await settleSolid();
    assertLabels(context, 'nested sequential/natural composition reaches stable registration order', mounted, 'nested-group', [
      'nested-a-content',
      'nested-b-content',
      'nested-c-content',
      'nested-d-content',
    ]);
  } finally {
    disposeCase(mounted);
  }
}

async function runNestedTogetherMinimal(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="together">
      <View accessibilityLabel="minimal-group">
        <Loading fallback={<Text accessibilityLabel="minimal-a-fallback">A loading</Text>}>
          <AsyncText request={a} label="minimal-a-content" />
        </Loading>
        <Reveal order="sequential">
          <Loading fallback={<Text accessibilityLabel="minimal-b-fallback">B loading</Text>}>
            <AsyncText request={b} label="minimal-b-content" />
          </Loading>
          <Loading fallback={<Text accessibilityLabel="minimal-c-fallback">C loading</Text>}>
            <AsyncText request={c} label="minimal-c-content" />
          </Loading>
        </Reveal>
      </View>
    </Reveal>
  ));

  try {
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'outer together waits when nested sequential is not minimally ready', mounted, 'minimal-group', [
      'minimal-a-fallback',
      'minimal-b-fallback',
      'minimal-c-fallback',
    ]);

    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'nested sequential becomes minimally ready at its first slot and releases outer together', mounted, 'minimal-group', [
      'minimal-a-content',
      'minimal-b-content',
      'minimal-c-fallback',
    ]);

    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'nested sequential continues its own local order after outer release', mounted, 'minimal-group', [
      'minimal-a-content',
      'minimal-b-content',
      'minimal-c-content',
    ]);
  } finally {
    disposeCase(mounted);
  }
}

async function runErroredRecovery(context: ScenarioContext): Promise<void> {
  let activeRequest = deferred<string>();
  const recoveryRequest = deferred<string>();
  const second = deferred<string>();
  const [generation, setGeneration] = createSignal(0);
  let resetError: (() => void) | undefined;

  function RecoverableContent(): HostNode {
    const value = createMemo(() => {
      generation();
      return activeRequest.promise;
    });
    return <Text accessibilityLabel="error-content">Recovered: {value()}</Text>;
  }

  const mounted = await mountCase(() => (
    <Reveal order="sequential">
      <View accessibilityLabel="error-group">
        <Loading fallback={<Text accessibilityLabel="error-loading">Error slot loading</Text>}>
          <Errored
            fallback={(error, reset) => {
              resetError = reset;
              return <Text accessibilityLabel="error-fallback">Error: {String(error())}</Text>;
            }}
          >
            <RecoverableContent />
          </Errored>
        </Loading>
        <Loading fallback={<Text accessibilityLabel="error-second-fallback">Second loading</Text>}>
          <AsyncText request={second} label="error-second-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    second.resolve('Second');
    await settleSolid();
    assertLabels(context, 'ready second branch remains held behind pending error-capable frontier', mounted, 'error-group', [
      'error-loading',
      'error-second-fallback',
    ]);

    const firstRequest = activeRequest;
    firstRequest.reject(new Error('boom'));
    await settleSolid();
    assertLabels(context, 'Errored fallback counts as visible content and advances sequential Reveal', mounted, 'error-group', [
      'error-fallback',
      'error-second-content',
    ]);
    const errorNode = requireNodeByLabel(mounted.host, mounted.bridge, 'error-fallback');
    context.assert(
      'Errored exposes the rejection message inside Reveal',
      textContent(errorNode).includes('boom'),
      `error text was ${textContent(errorNode)}`,
    );

    activeRequest = recoveryRequest;
    setGeneration(value => value + 1);
    resetError?.();
    flush();
    await settleSolid();
    assertLabels(context, 'error reset re-enters pending state and reapplies sequential ordering', mounted, 'error-group', [
      'error-loading',
      'error-second-fallback',
    ]);
    context.assert(
      'error recovery removes stale error fallback immediately',
      findNodeByLabel(mounted.host, mounted.bridge, 'error-fallback') === undefined,
    );

    recoveryRequest.resolve('OK');
    await settleSolid();
    assertLabels(context, 'successful retry restores recovered content and the held ready sibling', mounted, 'error-group', [
      'error-content',
      'error-second-content',
    ]);
    context.assert(
      'error recovery leaves no ghost loading/error nodes',
      findNodeByLabel(mounted.host, mounted.bridge, 'error-loading') === undefined &&
        findNodeByLabel(mounted.host, mounted.bridge, 'error-fallback') === undefined &&
        findNodeByLabel(mounted.host, mounted.bridge, 'error-second-fallback') === undefined,
    );
  } finally {
    disposeCase(mounted);
  }
}

async function runAsyncIterable(context: ScenarioContext): Promise<void> {
  const stream = new ControlledAsyncIterable<string>();
  const second = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="sequential">
      <View accessibilityLabel="stream-group">
        <Loading fallback={<Text accessibilityLabel="stream-fallback">Stream loading</Text>}>
          <StreamText stream={stream} label="stream-content" />
        </Loading>
        <Loading fallback={<Text accessibilityLabel="stream-second-fallback">Second loading</Text>}>
          <AsyncText request={second} label="stream-second-content" />
        </Loading>
      </View>
    </Reveal>
  ));

  try {
    second.resolve('Second');
    await settleSolid();
    assertLabels(context, 'ready sibling remains held before first AsyncIterable yield', mounted, 'stream-group', [
      'stream-fallback',
      'stream-second-fallback',
    ]);

    stream.push('one');
    await settleSolid();
    assertLabels(context, 'first AsyncIterable yield makes the Reveal slot ready', mounted, 'stream-group', [
      'stream-content',
      'stream-second-content',
    ]);
    const streamNode = requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content');
    const streamTextId = streamNode.children[0]?.id;
    context.assert('stream content owns one native text child', streamTextId !== undefined);

    const mark = mounted.bridge.mark();
    stream.push('two');
    await settleSolid();
    const operations = mounted.bridge.since(mark);
    const counts = mutationCounts(operations);
    const streamNodeAfter = requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content');
    context.assert('later AsyncIterable yield preserves native content identity', streamNodeAfter.id === streamNode.id);
    context.assert(
      'later AsyncIterable yield performs exactly one native replaceText',
      counts.replaceText === 1,
      `replaceText=${counts.replaceText}`,
    );
    context.assert(
      'later AsyncIterable yield performs no structural/property/event replay',
      counts.createElement === 0 &&
        counts.createTextNode === 0 &&
        counts.insertNode === 0 &&
        counts.removeNode === 0 &&
        counts.setProperty === 0 &&
        counts.setEventEnabled === 0,
      JSON.stringify(counts),
    );
    context.assert(
      'later AsyncIterable yield targets the same text node',
      streamTextId !== undefined &&
        operations.some(
          operation =>
            operation.kind === 'replaceText' && operation.id === streamTextId && operation.value === 'Stream: two',
        ),
    );
    context.assert(
      'later AsyncIterable yield updates visible text without stale value',
      textContent(streamNodeAfter) === 'Stream: two',
      `text=${textContent(streamNodeAfter)}`,
    );

    stream.complete();
    await settleSolid();
    context.assert(
      'AsyncIterable completion leaves last revealed value stable',
      textContent(requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content')) === 'Stream: two',
    );
  } finally {
    disposeCase(mounted);
  }
}

function recordStats(context: ScenarioContext, prefix: string, samples: readonly number[]): void {
  const stats = sampleStats(samples);
  context.metric(`${prefix}.samples`, samples.length, 'count');
  context.metric(`${prefix}.min`, stats.min, 'ms');
  context.metric(`${prefix}.mean`, stats.mean, 'ms');
  context.metric(`${prefix}.p50`, stats.p50, 'ms');
  context.metric(`${prefix}.p95`, stats.p95, 'ms');
  context.metric(`${prefix}.p99`, stats.p99, 'ms');
  context.metric(`${prefix}.max`, stats.max, 'ms');
}

async function runBenchmark(context: ScenarioContext): Promise<void> {
  const samples: number[] = [];
  let expectedCounts: ReturnType<typeof mutationCounts> | undefined;

  for (let sample = 0; sample < BENCHMARK_SAMPLES; sample += 1) {
    const a = deferred<string>();
    const b = deferred<string>();
    const mounted = await mountCase(() => (
      <Reveal order="sequential">
        <View accessibilityLabel="bench-group">
          <Loading fallback={<Text accessibilityLabel="bench-a-fallback">A loading</Text>}>
            <AsyncText request={a} label="bench-a-content" />
          </Loading>
          <Loading fallback={<Text accessibilityLabel="bench-b-fallback">B loading</Text>}>
            <AsyncText request={b} label="bench-b-content" />
          </Loading>
        </View>
      </Reveal>
    ));

    try {
      b.resolve('B');
      await settleSolid();
      const mark = mounted.bridge.mark();
      const started = context.now();
      a.resolve('A');
      await settleSolid();
      samples.push(context.now() - started);

      const operations = mounted.bridge.since(mark);
      const counts = mutationCounts(operations);
      if (!expectedCounts) expectedCounts = counts;
      context.assert(
        `benchmark sample ${sample + 1} preserves deterministic native mutation counts`,
        expectedCounts.createElement === counts.createElement &&
          expectedCounts.createTextNode === counts.createTextNode &&
          expectedCounts.replaceText === counts.replaceText &&
          expectedCounts.setProperty === counts.setProperty &&
          expectedCounts.insertNode === counts.insertNode &&
          expectedCounts.removeNode === counts.removeNode &&
          expectedCounts.setEventEnabled === counts.setEventEnabled,
        JSON.stringify(counts),
      );
      assertLabels(
        context,
        `benchmark sample ${sample + 1} reaches correct final reveal order`,
        mounted,
        'bench-group',
        ['bench-a-content', 'bench-b-content'],
      );
    } finally {
      disposeCase(mounted);
    }
  }

  recordStats(context, 'sequential.frontier-release', samples);
  if (expectedCounts) {
    context.metric('sequential.frontier-release.native.createElement', expectedCounts.createElement, 'count');
    context.metric('sequential.frontier-release.native.createTextNode', expectedCounts.createTextNode, 'count');
    context.metric('sequential.frontier-release.native.replaceText', expectedCounts.replaceText, 'count');
    context.metric('sequential.frontier-release.native.setProperty', expectedCounts.setProperty, 'count');
    context.metric('sequential.frontier-release.native.insertNode', expectedCounts.insertNode, 'count');
    context.metric('sequential.frontier-release.native.removeNode', expectedCounts.removeNode, 'count');
    context.metric('sequential.frontier-release.native.setEventEnabled', expectedCounts.setEventEnabled, 'count');
  }
}

async function runRevealSuite(context: ScenarioContext): Promise<void> {
  const supportedOrders: readonly RevealMode[] = ['sequential', 'together', 'natural'];
  context.assert(
    'pinned Solid 2 RC Reveal order surface is sequential/together/natural',
    sameStrings(supportedOrders, ['sequential', 'together', 'natural']),
    'forwards/backwards are legacy SuspenseList vocabulary and are not RevealOrder values in Solid 2 RC',
  );

  await runSequential(context);
  await runCollapsedSequential(context);
  await runTogether(context);
  await runNatural(context);
  await runNestedSequentialNatural(context);
  await runNestedTogetherMinimal(context);
  await runErroredRecovery(context);
  await runAsyncIterable(context);
  await runBenchmark(context);
}

export const scenario: ScenarioDefinition = {
  id: 'reveal-ordering',
  title: 'Solid 2 Reveal ordering, nesting, errors, streams, and native identity',
  workstream: 'reveal',
  kind: 'hybrid',
  run: runRevealSuite,
};
