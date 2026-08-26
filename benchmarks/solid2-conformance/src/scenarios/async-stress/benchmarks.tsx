import { Text, View } from '@stingjs/native';
import { render } from '@stingjs/solid';
import { createMemo, createSignal, flush, Loading } from 'solid-js';
import type { ScenarioContext } from '../../harness/types.js';
import { ControlledAsyncIterator, deferred, drainAsync, type Deferred } from './controls.js';
import { PromiseContent, StreamContent } from './components.js';
import {
  assertOnlyReplaceText,
  benchmark,
  hasTextContaining,
  type HostInstrumentation,
} from './instrumentation.js';

export async function runBenchmarks(context: ScenarioContext, instrumentation: HostInstrumentation): Promise<void> {
  await benchmark(context, 'async-settle', async () => {
    const request = deferred<string>();
    const constantGeneration = () => 0;
    const dispose = render(
      () => (
        <Loading fallback={<Text>bench-settle:loading</Text>}>
          <PromiseContent prefix="bench-settle:value" generation={constantGeneration} request={() => request.promise} />
        </Loading>
      ),
      instrumentation.host.root,
    );
    await drainAsync();
    const mark = instrumentation.mark();
    return {
      async run() {
        request.resolve('ready');
        await drainAsync();
        return instrumentation.since(mark).length;
      },
      async cleanup() {
        dispose();
        await drainAsync();
      },
    };
  });

  await benchmark(context, 'pending-refresh', async () => {
    let request = deferred<string>();
    request.resolve('base');
    const [generation, setGeneration] = createSignal(0);
    const dispose = render(
      () => (
        <Loading fallback={<Text>bench-refresh:loading</Text>}>
          <PromiseContent prefix="bench-refresh:value" generation={generation} request={() => request.promise} />
        </Loading>
      ),
      instrumentation.host.root,
    );
    await drainAsync();
    request = deferred<string>();
    setGeneration(value => value + 1);
    flush();
    await drainAsync();
    const mark = instrumentation.mark();
    return {
      async run() {
        request.resolve('next');
        await drainAsync();
        const mutations = instrumentation.since(mark);
        assertOnlyReplaceText(context, 'benchmark pending refresh', mutations, 1);
        return mutations.length;
      },
      async cleanup() {
        dispose();
        await drainAsync();
      },
    };
  });

  await benchmark(context, 'iterator-yield', async () => {
    const stream = new ControlledAsyncIterator<string>();
    const constantGeneration = () => 0;
    const dispose = render(
      () => (
        <Loading fallback={<Text>bench-stream:loading</Text>}>
          <StreamContent prefix="bench-stream:value" generation={constantGeneration} stream={() => stream} />
        </Loading>
      ),
      instrumentation.host.root,
    );
    stream.push('first');
    await drainAsync();
    const mark = instrumentation.mark();
    return {
      async run() {
        stream.push('second');
        await drainAsync();
        const mutations = instrumentation.since(mark);
        assertOnlyReplaceText(context, 'benchmark iterator yield', mutations, 1);
        return mutations.length;
      },
      async cleanup() {
        dispose();
        await drainAsync();
      },
    };
  });

  await benchmark(context, 'multiple-subscriber-settle', async () => {
    let request = deferred<string>();
    request.resolve('base');
    const [generation, setGeneration] = createSignal(0);

    function Content() {
      const value = createMemo<string>(() => {
        generation();
        return request.promise;
      });
      return (
        <Loading fallback={<Text>bench-fanout:loading</Text>}>
          <View>
            <Text>bench-fanout:a:{value()}</Text>
            <Text>bench-fanout:b:{value()}</Text>
          </View>
        </Loading>
      );
    }

    const dispose = render(() => <Content />, instrumentation.host.root);
    await drainAsync();
    request = deferred<string>();
    setGeneration(value => value + 1);
    flush();
    await drainAsync();
    const mark = instrumentation.mark();
    return {
      async run() {
        request.resolve('next');
        await drainAsync();
        const mutations = instrumentation.since(mark);
        assertOnlyReplaceText(context, 'benchmark multiple subscriber settle', mutations, 2);
        return mutations.length;
      },
      async cleanup() {
        dispose();
        await drainAsync();
      },
    };
  });

  await benchmark(context, 'race-resolution-handling', async () => {
    const requests = new Map<string, Deferred<string>>();
    requests.set('base', deferred<string>());
    requests.set('A', deferred<string>());
    requests.set('B', deferred<string>());
    const [source, setSource] = createSignal('base');

    function Content() {
      const value = createMemo<string>(() => {
        const request = requests.get(source());
        if (!request) throw new Error('missing benchmark race request');
        return request.promise;
      });
      return (
        <Loading fallback={<Text>bench-race:loading</Text>}>
          <Text>bench-race:value:{value()}</Text>
        </Loading>
      );
    }

    const dispose = render(() => <Content />, instrumentation.host.root);
    requests.get('base')?.resolve('baseline');
    await drainAsync();
    setSource('A');
    flush();
    setSource('B');
    flush();
    await drainAsync();
    const mark = instrumentation.mark();

    return {
      async run() {
        requests.get('A')?.resolve('stale-A');
        await drainAsync();
        const mutations = instrumentation.since(mark);
        assertOnlyReplaceText(context, 'benchmark stale race resolution', mutations, 0);
        context.assert(
          'benchmark stale race resolution: stale result is not published',
          !hasTextContaining(instrumentation.host.root, 'stale-A'),
        );
        return mutations.length;
      },
      async cleanup() {
        requests.get('B')?.resolve('current-B');
        await drainAsync();
        dispose();
        await drainAsync();
      },
    };
  });
}
