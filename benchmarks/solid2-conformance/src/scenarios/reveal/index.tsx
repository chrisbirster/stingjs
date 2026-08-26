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
  requireNodeByLabel,
  textContent,
  type TraceHost,
} from './nativeTrace.js';

type RevealMode = 'sequential' | 'together' | 'natural';
type MountedCase = TraceHost & { readonly disposeRender: () => void };
const BENCHMARK_SAMPLES = 24;

function AsyncText(props: { request: Deferred<string>; label: string; prefix?: string }) {
  const value = createMemo(() => props.request.promise);
  return <Text accessibilityLabel={props.label}>{props.prefix ?? ''}{value()}</Text>;
}

function StreamText(props: { stream: ControlledAsyncIterable<string>; label: string }) {
  const value = createMemo<string>(() => props.stream);
  return <Text accessibilityLabel={props.label}>Stream: {value()}</Text>;
}

async function mountCase(code: () => unknown): Promise<MountedCase> {
  const trace = createTraceHost();
  const disposeRender = render(() => code() as HostNode, trace.host.root);
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
  context.assert(name, sameStrings(actual, expected), `expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
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
    assertLabels(context, 'sequential initially exposes all non-collapsed fallbacks', mounted, 'seq-group', [
      'seq-a-fallback', 'seq-b-fallback', 'seq-c-fallback',
    ]);
    const bFallbackId = requireNodeByLabel(mounted.host, mounted.bridge, 'seq-b-fallback').id;
    const cFallbackId = requireNodeByLabel(mounted.host, mounted.bridge, 'seq-c-fallback').id;

    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'sequential holds later ready content behind the frontier', mounted, 'seq-group', [
      'seq-a-fallback', 'seq-b-fallback', 'seq-c-fallback',
    ]);

    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'sequential releases only the ready prefix', mounted, 'seq-group', [
      'seq-a-content', 'seq-b-fallback', 'seq-c-fallback',
    ]);
    context.assert(
      'sequential preserves held fallback identities',
      requireNodeByLabel(mounted.host, mounted.bridge, 'seq-b-fallback').id === bFallbackId &&
        requireNodeByLabel(mounted.host, mounted.bridge, 'seq-c-fallback').id === cFallbackId,
    );

    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'sequential releases the ready tail in registration order', mounted, 'seq-group', [
      'seq-a-content', 'seq-b-content', 'seq-c-content',
    ]);
    context.assert(
      'sequential leaves no ghost fallbacks',
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
    assertLabels(context, 'collapsed sequential exposes only the frontier fallback', mounted, 'collapsed-group', ['collapsed-a-fallback']);
    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'collapsed sequential suppresses a ready tail', mounted, 'collapsed-group', ['collapsed-a-fallback']);
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'collapsed sequential advances one frontier slot', mounted, 'collapsed-group', [
      'collapsed-a-content', 'collapsed-b-fallback',
    ]);
    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'collapsed sequential reveals the ready tail when frontier clears', mounted, 'collapsed-group', [
      'collapsed-a-content', 'collapsed-b-content', 'collapsed-c-content',
    ]);
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
        <Loading fallback={<Text accessibilityLabel="together-a-fallback">A loading</Text>}><AsyncText request={a} label="together-a-content" /></Loading>
        <Loading fallback={<Text accessibilityLabel="together-b-fallback">B loading</Text>}><AsyncText request={b} label="together-b-content" /></Loading>
        <Loading fallback={<Text accessibilityLabel="together-c-fallback">C loading</Text>}><AsyncText request={c} label="together-c-content" /></Loading>
      </View>
    </Reveal>
  ));
  try {
    assertLabels(context, 'together exposes all fallbacks while incomplete', mounted, 'together-group', [
      'together-a-fallback', 'together-b-fallback', 'together-c-fallback',
    ]);
    c.resolve('C');
    await settleSolid();
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'together holds ready slots until every direct slot is ready', mounted, 'together-group', [
      'together-a-fallback', 'together-b-fallback', 'together-c-fallback',
    ]);
    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'together releases every direct slot cohesively', mounted, 'together-group', [
      'together-a-content', 'together-b-content', 'together-c-content',
    ]);
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
        <Loading fallback={<Text accessibilityLabel="natural-a-fallback">A loading</Text>}><AsyncText request={a} label="natural-a-content" /></Loading>
        <Loading fallback={<Text accessibilityLabel="natural-b-fallback">B loading</Text>}><AsyncText request={b} label="natural-b-content" /></Loading>
        <Loading fallback={<Text accessibilityLabel="natural-c-fallback">C loading</Text>}><AsyncText request={c} label="natural-c-content" /></Loading>
      </View>
    </Reveal>
  ));
  try {
    assertLabels(context, 'natural initially exposes all fallbacks', mounted, 'natural-group', [
      'natural-a-fallback', 'natural-b-fallback', 'natural-c-fallback',
    ]);
    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'natural reveals a later sibling independently', mounted, 'natural-group', [
      'natural-a-fallback', 'natural-b-fallback', 'natural-c-content',
    ]);
    const cId = requireNodeByLabel(mounted.host, mounted.bridge, 'natural-c-content').id;
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'natural reveals an earlier sibling without disturbing ready tail', mounted, 'natural-group', [
      'natural-a-content', 'natural-b-fallback', 'natural-c-content',
    ]);
    context.assert('natural preserves already revealed sibling identity', requireNodeByLabel(mounted.host, mounted.bridge, 'natural-c-content').id === cId);
    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'natural eventually exposes all independently ready content', mounted, 'natural-group', [
      'natural-a-content', 'natural-b-content', 'natural-c-content',
    ]);
  } finally {
    disposeCase(mounted);
  }
}

async function runNested(context: ScenarioContext): Promise<void> {
  const a = deferred<string>();
  const b = deferred<string>();
  const c = deferred<string>();
  const d = deferred<string>();
  const mounted = await mountCase(() => (
    <Reveal order="sequential">
      <View accessibilityLabel="nested-group">
        <Loading fallback={<Text accessibilityLabel="nested-a-fallback">A loading</Text>}><AsyncText request={a} label="nested-a-content" /></Loading>
        <Reveal order="natural">
          <Loading fallback={<Text accessibilityLabel="nested-b-fallback">B loading</Text>}><AsyncText request={b} label="nested-b-content" /></Loading>
          <Loading fallback={<Text accessibilityLabel="nested-c-fallback">C loading</Text>}><AsyncText request={c} label="nested-c-content" /></Loading>
        </Reveal>
        <Loading fallback={<Text accessibilityLabel="nested-d-fallback">D loading</Text>}><AsyncText request={d} label="nested-d-content" /></Loading>
      </View>
    </Reveal>
  ));
  try {
    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'outer sequential prevents nested natural escape', mounted, 'nested-group', [
      'nested-a-fallback', 'nested-b-fallback', 'nested-c-fallback', 'nested-d-fallback',
    ]);
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'outer sequential releases nested group at its frontier', mounted, 'nested-group', [
      'nested-a-content', 'nested-b-fallback', 'nested-c-content', 'nested-d-fallback',
    ]);
    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'outer sequential advances when nested group is fully ready', mounted, 'nested-group', [
      'nested-a-content', 'nested-b-content', 'nested-c-content', 'nested-d-fallback',
    ]);
    d.resolve('D');
    await settleSolid();
    assertLabels(context, 'nested Reveal reaches stable registration order', mounted, 'nested-group', [
      'nested-a-content', 'nested-b-content', 'nested-c-content', 'nested-d-content',
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
        <Loading fallback={<Text accessibilityLabel="minimal-a-fallback">A loading</Text>}><AsyncText request={a} label="minimal-a-content" /></Loading>
        <Reveal order="sequential">
          <Loading fallback={<Text accessibilityLabel="minimal-b-fallback">B loading</Text>}><AsyncText request={b} label="minimal-b-content" /></Loading>
          <Loading fallback={<Text accessibilityLabel="minimal-c-fallback">C loading</Text>}><AsyncText request={c} label="minimal-c-content" /></Loading>
        </Reveal>
      </View>
    </Reveal>
  ));
  try {
    a.resolve('A');
    await settleSolid();
    assertLabels(context, 'outer together waits for nested sequential minimum readiness', mounted, 'minimal-group', [
      'minimal-a-fallback', 'minimal-b-fallback', 'minimal-c-fallback',
    ]);
    b.resolve('B');
    await settleSolid();
    assertLabels(context, 'nested first slot releases outer together', mounted, 'minimal-group', [
      'minimal-a-content', 'minimal-b-content', 'minimal-c-fallback',
    ]);
    c.resolve('C');
    await settleSolid();
    assertLabels(context, 'nested sequential continues locally after outer release', mounted, 'minimal-group', [
      'minimal-a-content', 'minimal-b-content', 'minimal-c-content',
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

  function RecoverableContent() {
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
          <Errored fallback={(error, reset) => {
            resetError = reset;
            return <Text accessibilityLabel="error-fallback">Error: {String(error())}</Text>;
          }}>
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
    assertLabels(context, 'ready sibling remains held behind pending error-capable frontier', mounted, 'error-group', [
      'error-loading', 'error-second-fallback',
    ]);
    activeRequest.reject(new Error('boom'));
    await settleSolid();
    assertLabels(context, 'Errored fallback is visible content and advances sequential Reveal', mounted, 'error-group', [
      'error-fallback', 'error-second-content',
    ]);
    context.assert('Errored exposes rejection message', textContent(requireNodeByLabel(mounted.host, mounted.bridge, 'error-fallback')).includes('boom'));

    activeRequest = recoveryRequest;
    setGeneration(value => value + 1);
    resetError?.();
    flush();
    await settleSolid();
    assertLabels(context, 'rc.1 keeps error fallback visible while retry is pending', mounted, 'error-group', [
      'error-fallback', 'error-second-content',
    ]);
    context.assert('retry retains the captured error until recovery settles', findNodeByLabel(mounted.host, mounted.bridge, 'error-fallback') !== undefined);

    recoveryRequest.resolve('OK');
    await settleSolid();
    assertLabels(context, 'successful retry replaces error fallback with recovered content', mounted, 'error-group', [
      'error-content', 'error-second-content',
    ]);
    context.assert(
      'successful retry leaves no ghost loading/error nodes',
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
    assertLabels(context, 'ready sibling remains held before first stream yield', mounted, 'stream-group', [
      'stream-fallback', 'stream-second-fallback',
    ]);
    stream.push('one');
    await settleSolid();
    assertLabels(context, 'first stream yield makes slot ready', mounted, 'stream-group', [
      'stream-content', 'stream-second-content',
    ]);
    const streamNode = requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content');
    const textId = streamNode.children[0]?.id;
    const mark = mounted.bridge.mark();
    stream.push('two');
    await settleSolid();
    const operations = mounted.bridge.since(mark);
    const counts = mutationCounts(operations);
    const streamAfter = requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content');
    context.assert('later stream yield preserves native content identity', streamAfter.id === streamNode.id);
    context.assert('later stream yield performs exactly one replaceText', counts.replaceText === 1, JSON.stringify(counts));
    context.assert(
      'later stream yield has no structural/property/event replay',
      counts.createElement === 0 && counts.createTextNode === 0 && counts.insertNode === 0 &&
        counts.removeNode === 0 && counts.setProperty === 0 && counts.setEventEnabled === 0,
      JSON.stringify(counts),
    );
    context.assert(
      'later stream yield targets the same native text identity',
      textId !== undefined && operations.some(operation => operation.kind === 'replaceText' && operation.id === textId && operation.value === 'Stream: two'),
    );
    stream.complete();
    await settleSolid();
    context.assert('stream completion preserves final yielded value', textContent(requireNodeByLabel(mounted.host, mounted.bridge, 'stream-content')) === 'Stream: two');
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
          <Loading fallback={<Text accessibilityLabel="bench-a-fallback">A loading</Text>}><AsyncText request={a} label="bench-a-content" /></Loading>
          <Loading fallback={<Text accessibilityLabel="bench-b-fallback">B loading</Text>}><AsyncText request={b} label="bench-b-content" /></Loading>
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
      const counts = mutationCounts(mounted.bridge.since(mark));
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
      assertLabels(context, `benchmark sample ${sample + 1} reaches final reveal order`, mounted, 'bench-group', [
        'bench-a-content', 'bench-b-content',
      ]);
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
  );
  await runSequential(context);
  await runCollapsedSequential(context);
  await runTogether(context);
  await runNatural(context);
  await runNested(context);
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
