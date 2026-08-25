import { Text, View } from '@stingjs/native';
import { render } from '@stingjs/solid';
import { createMemo, createSignal, flush, Loading } from 'solid-js';
import type { ScenarioContext } from '../../harness/types.js';
import { ControlledAsyncIterator, deferred, drainAsync } from './controls.js';
import { PromiseContent, StreamContent } from './components.js';
import { assertOnlyReplaceText, benchmark, type HostInstrumentation } from './instrumentation.js';

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
}
