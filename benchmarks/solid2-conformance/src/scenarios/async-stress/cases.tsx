import { Text, View } from '@stingjs/native';
import { render } from '@stingjs/solid';
import { createMemo, createSignal, Errored, flush, Loading } from 'solid-js';
import type { ScenarioContext } from '../../harness/types.js';
import { ControlledAsyncIterator, deferred, drainAsync, type Deferred } from './controls.js';
import { PromiseContent, StreamContent } from './components.js';
import {
  assertOnlyReplaceText,
  findTextNode,
  hasText,
  hasTextContaining,
  type HostInstrumentation,
} from './instrumentation.js';

export async function testMultipleSubscribers(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  let request = deferred<string>();
  const [generation, setGeneration] = createSignal(0);

  function Content() {
    const value = createMemo<string>(() => {
      generation();
      return request.promise;
    });
    return (
      <Loading fallback={<Text>fanout:loading</Text>}>
        <View>
          <Text>fanout:a:{value()}</Text>
          <Text>fanout:b:{value()}</Text>
        </View>
      </Loading>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  request.resolve('zero');
  await drainAsync();

  const firstA = findTextNode(instrumentation.host.root, 'fanout:a:zero');
  const firstB = findTextNode(instrumentation.host.root, 'fanout:b:zero');
  context.assert('multiple subscribers: first subscriber settles', firstA !== undefined);
  context.assert('multiple subscribers: second subscriber settles', firstB !== undefined);
  context.assert(
    'multiple subscribers: distinct native text identity',
    firstA !== undefined && firstB !== undefined && firstA.id !== firstB.id,
  );

  request = deferred<string>();
  setGeneration(value => value + 1);
  flush();
  await drainAsync();
  context.assert('multiple subscribers: stale A preserved while pending', hasText(instrumentation.host.root, 'fanout:a:zero'));
  context.assert('multiple subscribers: stale B preserved while pending', hasText(instrumentation.host.root, 'fanout:b:zero'));

  const mark = instrumentation.mark();
  request.resolve('one');
  await drainAsync();
  const mutations = instrumentation.since(mark);
  assertOnlyReplaceText(context, 'multiple subscribers settle', mutations, 2);

  const nextA = findTextNode(instrumentation.host.root, 'fanout:a:one');
  const nextB = findTextNode(instrumentation.host.root, 'fanout:b:one');
  context.assert('multiple subscribers: first native identity preserved', firstA?.id === nextA?.id);
  context.assert('multiple subscribers: second native identity preserved', firstB?.id === nextB?.id);

  dispose();
  await drainAsync();
}

export async function testAsyncDependency(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const innerRequest = deferred<string>();
  const outerRequests = new Map<string, Deferred<string>>();
  const outerForInner = deferred<string>();
  outerRequests.set('inner-1', outerForInner);

  function Content() {
    const inner = createMemo<string>(() => innerRequest.promise);
    const outer = createMemo<string>(() => {
      const key = inner();
      const next = outerRequests.get(key);
      if (!next) throw new Error(`missing outer request for ${key}`);
      return next.promise;
    });
    return (
      <Loading fallback={<Text>dependency:loading</Text>}>
        <Text>dependency:{outer()}</Text>
      </Loading>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  context.assert('async dependency: starts loading', hasText(instrumentation.host.root, 'dependency:loading'));
  innerRequest.resolve('inner-1');
  await drainAsync();
  context.assert('async dependency: outer async memo remains pending', hasText(instrumentation.host.root, 'dependency:loading'));
  outerForInner.resolve('outer-1');
  await drainAsync();
  context.assert('async dependency: nested async memo settles', hasText(instrumentation.host.root, 'dependency:outer-1'));

  dispose();
  await drainAsync();
}

export async function testConcurrentPromises(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const left = deferred<string>();
  const right = deferred<string>();

  function Content() {
    const value = createMemo<string>(() =>
      Promise.all([left.promise, right.promise]).then(parts => `${parts[0]}+${parts[1]}`),
    );
    return (
      <Loading fallback={<Text>concurrent:loading</Text>}>
        <Text>concurrent:{value()}</Text>
      </Loading>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  left.resolve('left');
  await drainAsync();
  context.assert('concurrent promises: one settle is insufficient', hasText(instrumentation.host.root, 'concurrent:loading'));
  right.resolve('right');
  await drainAsync();
  context.assert('concurrent promises: all settle together', hasText(instrumentation.host.root, 'concurrent:left+right'));

  dispose();
  await drainAsync();
}

export async function testRapidInvalidationAndRace(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const requests = new Map<string, Deferred<string>>();
  requests.set('base', deferred<string>());
  requests.set('A', deferred<string>());
  requests.set('B', deferred<string>());
  const [source, setSource] = createSignal('base');

  function Content() {
    const value = createMemo<string>(() => {
      const request = requests.get(source());
      if (!request) throw new Error('missing race request');
      return request.promise;
    });
    return (
      <Loading fallback={<Text>race:loading</Text>}>
        <Text>race:{value()}</Text>
      </Loading>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  requests.get('base')?.resolve('baseline');
  await drainAsync();
  const baselineNode = findTextNode(instrumentation.host.root, 'race:baseline');
  context.assert('race: baseline settles', baselineNode !== undefined);

  setSource('A');
  flush();
  setSource('B');
  flush();
  await drainAsync();
  context.assert('rapid invalidation: stale value survives A then B', hasText(instrumentation.host.root, 'race:baseline'));

  const staleMark = instrumentation.mark();
  requests.get('A')?.resolve('stale-A');
  await drainAsync();
  const staleMutations = instrumentation.since(staleMark);
  context.assert('race: stale A never overwrites B', !hasText(instrumentation.host.root, 'race:stale-A'));
  context.assert('race: stale resolution causes zero native mutations', staleMutations.length === 0, JSON.stringify(staleMutations));

  const currentMark = instrumentation.mark();
  requests.get('B')?.resolve('current-B');
  await drainAsync();
  const currentMutations = instrumentation.since(currentMark);
  assertOnlyReplaceText(context, 'race current resolution', currentMutations, 1);
  const currentNode = findTextNode(instrumentation.host.root, 'race:current-B');
  context.assert('race: native text identity preserved', baselineNode?.id === currentNode?.id);

  dispose();
  await drainAsync();
}

export async function testErrorAndRetryRace(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const requests = new Map<string, Deferred<string>>();
  for (const key of ['base', 'stale-error', 'winner', 'active-error', 'retry']) {
    requests.set(key, deferred<string>());
  }
  const [source, setSource] = createSignal('base');
  let resetBoundary: (() => void) | undefined;

  function AsyncValue() {
    const value = createMemo<string>(() => {
      const request = requests.get(source());
      if (!request) throw new Error('missing error-race request');
      return request.promise;
    });
    return (
      <Loading fallback={<Text>error-race:loading</Text>}>
        <Text>error-race:{value()}</Text>
      </Loading>
    );
  }

  function Content() {
    return (
      <Errored
        fallback={(error: () => unknown, reset: () => void) => {
          resetBoundary = reset;
          return <Text>error-race:caught:{String(error())}</Text>;
        }}
      >
        <AsyncValue />
      </Errored>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  requests.get('base')?.resolve('baseline');
  await drainAsync();
  context.assert('error race: baseline settles', hasText(instrumentation.host.root, 'error-race:baseline'));

  setSource('stale-error');
  flush();
  setSource('winner');
  flush();
  await drainAsync();
  requests.get('stale-error')?.reject(new Error('stale boom'));
  await drainAsync();
  context.assert('error race: stale rejection does not trip boundary', !hasTextContaining(instrumentation.host.root, 'stale boom'));
  context.assert('error race: stale content remains after stale rejection', hasText(instrumentation.host.root, 'error-race:baseline'));

  requests.get('winner')?.resolve('winner-value');
  await drainAsync();
  context.assert('error race: winner settles', hasText(instrumentation.host.root, 'error-race:winner-value'));

  setSource('active-error');
  flush();
  await drainAsync();
  context.assert('error after stale content: winner stays visible while pending', hasText(instrumentation.host.root, 'error-race:winner-value'));
  requests.get('active-error')?.reject(new Error('active boom'));
  await drainAsync();
  context.assert('error after stale content: active error reaches Errored', hasTextContaining(instrumentation.host.root, 'active boom'));

  setSource('retry');
  resetBoundary?.();
  flush();
  await drainAsync();
  context.assert('retry: stale winner returns while retry is pending', hasText(instrumentation.host.root, 'error-race:winner-value'));
  context.assert('retry: error fallback is cleared on reset', !hasTextContaining(instrumentation.host.root, 'active boom'));
  requests.get('retry')?.resolve('recovered');
  await drainAsync();
  context.assert('retry: recovered value renders', hasText(instrumentation.host.root, 'error-race:recovered'));
  context.assert('retry: prior error is gone', !hasTextContaining(instrumentation.host.root, 'active boom'));

  dispose();
  await drainAsync();
}

export async function testNestedLoading(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const outerRequest = deferred<string>();
  const innerRequest = deferred<string>();
  const constantGeneration = () => 0;

  const dispose = render(
    () => (
      <Loading fallback={<Text>nested-loading:outer</Text>}>
        <View>
          <PromiseContent prefix="nested-loading:outer-value" generation={constantGeneration} request={() => outerRequest.promise} />
          <Loading fallback={<Text>nested-loading:inner</Text>}>
            <PromiseContent prefix="nested-loading:inner-value" generation={constantGeneration} request={() => innerRequest.promise} />
          </Loading>
        </View>
      </Loading>
    ),
    instrumentation.host.root,
  );

  context.assert('nested Loading: outer fallback owns outer pending work', hasText(instrumentation.host.root, 'nested-loading:outer'));
  outerRequest.resolve('outer-ready');
  await drainAsync();
  context.assert('nested Loading: outer value appears', hasText(instrumentation.host.root, 'nested-loading:outer-value:outer-ready'));
  context.assert('nested Loading: inner fallback remains isolated', hasText(instrumentation.host.root, 'nested-loading:inner'));
  innerRequest.resolve('inner-ready');
  await drainAsync();
  context.assert('nested Loading: inner settles independently', hasText(instrumentation.host.root, 'nested-loading:inner-value:inner-ready'));

  dispose();
  await drainAsync();
}

export async function testNestedErrored(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const innerRequest = deferred<string>();
  const outerRequest = deferred<string>();
  const constantGeneration = () => 0;

  const dispose = render(
    () => (
      <Errored fallback={(error: () => unknown) => <Text>nested-error:outer:{String(error())}</Text>}>
        <View>
          <Text>nested-error:stable-sibling</Text>
          <Errored fallback={(error: () => unknown) => <Text>nested-error:inner:{String(error())}</Text>}>
            <Loading fallback={<Text>nested-error:inner-loading</Text>}>
              <PromiseContent prefix="nested-error:inner-value" generation={constantGeneration} request={() => innerRequest.promise} />
            </Loading>
          </Errored>
          <Loading fallback={<Text>nested-error:outer-loading</Text>}>
            <PromiseContent prefix="nested-error:outer-value" generation={constantGeneration} request={() => outerRequest.promise} />
          </Loading>
        </View>
      </Errored>
    ),
    instrumentation.host.root,
  );

  innerRequest.reject(new Error('inner boom'));
  await drainAsync();
  context.assert('nested Errored: inner boundary catches inner error', hasTextContaining(instrumentation.host.root, 'nested-error:inner:Error: inner boom'));
  context.assert('nested Errored: outer sibling survives inner error', hasText(instrumentation.host.root, 'nested-error:stable-sibling'));
  outerRequest.reject(new Error('outer boom'));
  await drainAsync();
  context.assert('nested Errored: outer boundary catches outer error', hasTextContaining(instrumentation.host.root, 'nested-error:outer:Error: outer boom'));
  context.assert('nested Errored: outer fallback replaces nested subtree', !hasText(instrumentation.host.root, 'nested-error:stable-sibling'));

  dispose();
  await drainAsync();
}

export async function testIteratorSemantics(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  let stream = new ControlledAsyncIterator<string>();
  const [generation, setGeneration] = createSignal(0);
  let resetBoundary: (() => void) | undefined;

  function Content() {
    return (
      <Errored
        fallback={(error: () => unknown, reset: () => void) => {
          resetBoundary = reset;
          return <Text>stream:error:{String(error())}</Text>;
        }}
      >
        <Loading fallback={<Text>stream:loading</Text>}>
          <StreamContent prefix="stream:value" generation={generation} stream={() => stream} />
        </Loading>
      </Errored>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  context.assert('iterator: starts loading before first yield', hasText(instrumentation.host.root, 'stream:loading'));

  stream.push('one');
  await drainAsync();
  const firstNode = findTextNode(instrumentation.host.root, 'stream:value:one');
  context.assert('iterator: first yield becomes value', firstNode !== undefined);

  const secondMark = instrumentation.mark();
  stream.push('two');
  await drainAsync();
  const secondMutations = instrumentation.since(secondMark);
  assertOnlyReplaceText(context, 'iterator subsequent yield', secondMutations, 1);
  const secondNode = findTextNode(instrumentation.host.root, 'stream:value:two');
  context.assert('iterator: native identity preserved across yields', firstNode?.id === secondNode?.id);

  const thirdMark = instrumentation.mark();
  stream.push('three');
  await drainAsync();
  assertOnlyReplaceText(context, 'iterator repeated yield', instrumentation.since(thirdMark), 1);
  context.assert('iterator: repeated yield publishes latest value', hasText(instrumentation.host.root, 'stream:value:three'));

  const completionMark = instrumentation.mark();
  stream.complete();
  await drainAsync();
  context.assert('iterator normal completion: last value is retained', hasText(instrumentation.host.root, 'stream:value:three'));
  context.assert('iterator normal completion: no ghost native mutation', instrumentation.since(completionMark).length === 0, JSON.stringify(instrumentation.since(completionMark)));

  const failed = new ControlledAsyncIterator<string>();
  stream = failed;
  setGeneration(value => value + 1);
  flush();
  await drainAsync();
  failed.push('before-error');
  await drainAsync();
  context.assert('iterator error: replacement stream yields', hasText(instrumentation.host.root, 'stream:value:before-error'));
  failed.fail(new Error('iterator boom'));
  await drainAsync();
  context.assert('iterator error: Errored receives iterator rejection', hasTextContaining(instrumentation.host.root, 'iterator boom'));

  const replacement = new ControlledAsyncIterator<string>();
  stream = replacement;
  setGeneration(value => value + 1);
  resetBoundary?.();
  flush();
  await drainAsync();
  replacement.push('recovered-stream');
  await drainAsync();
  context.assert('iterator error: retry recovers with replacement stream', hasText(instrumentation.host.root, 'stream:value:recovered-stream'));

  const old = replacement;
  const current = new ControlledAsyncIterator<string>();
  stream = current;
  setGeneration(value => value + 1);
  flush();
  await drainAsync();
  current.push('current-stream');
  await drainAsync();
  const currentNode = findTextNode(instrumentation.host.root, 'stream:value:current-stream');
  context.assert('iterator source replacement: current source publishes', currentNode !== undefined);
  const staleMark = instrumentation.mark();
  old.push('ghost-old-stream');
  await drainAsync();
  context.assert('iterator source replacement: disposed source cannot publish', !hasTextContaining(instrumentation.host.root, 'ghost-old-stream'));
  context.assert('iterator source replacement: stale yield causes zero native mutations', instrumentation.since(staleMark).length === 0, JSON.stringify(instrumentation.since(staleMark)));

  dispose();
  await drainAsync();
  const disposedMark = instrumentation.mark();
  current.push('ghost-after-dispose');
  await drainAsync();
  context.assert(
    'iterator disposal: disposed source cannot publish native mutations',
    instrumentation.since(disposedMark).length === 0,
    JSON.stringify(instrumentation.since(disposedMark)),
  );
}

export async function testEmptyIterator(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const stream = new ControlledAsyncIterator<string>();
  const constantGeneration = () => 0;
  const dispose = render(
    () => (
      <Loading fallback={<Text>empty-stream:loading</Text>}>
        <StreamContent prefix="empty-stream:value" generation={constantGeneration} stream={() => stream} />
      </Loading>
    ),
    instrumentation.host.root,
  );

  stream.complete();
  await drainAsync();
  context.assert('AsyncIterable empty completion: iterator completes normally', stream.nextCalls >= 1);
  context.assert(
    'AsyncIterable empty completion: no value node is invented',
    !hasTextContaining(instrumentation.host.root, 'empty-stream:value:'),
  );

  dispose();
  await drainAsync();
}

export async function testPromiseResolvingToIterable(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  const stream = new ControlledAsyncIterator<string>();
  const streamRequest = deferred<AsyncIterable<string>>();

  function Content() {
    const value = createMemo<unknown>(() => streamRequest.promise as Promise<unknown>);
    const display = createMemo(() => typeof value() === 'string' ? value() : 'non-stream-scalar');
    return (
      <Loading fallback={<Text>promise-stream:loading</Text>}>
        <Text>promise-stream:value:{display()}</Text>
      </Loading>
    );
  }

  const dispose = render(() => <Content />, instrumentation.host.root);
  streamRequest.resolve(stream);
  await drainAsync();

  // Solid 2 RC may or may not recursively unwrap a Promise whose fulfillment
  // value is an AsyncIterable. If it does, prove the first streamed value. If
  // it treats the iterable as the fulfilled scalar, leave the optional case
  // unasserted rather than adding a compatibility shim that changes semantics.
  if (hasText(instrumentation.host.root, 'promise-stream:loading')) {
    stream.push('supported');
    await drainAsync();
    if (hasText(instrumentation.host.root, 'promise-stream:value:supported')) {
      context.assert('Promise resolving to AsyncIterable: supported by pinned Solid RC', true);
    }
  }

  dispose();
  await drainAsync();
}