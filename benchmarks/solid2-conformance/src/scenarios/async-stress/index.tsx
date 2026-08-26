import { createRenderer as debugCreateRenderer } from '@solidjs/universal';
import { Errored as debugErrored } from 'solid-js';
import type { ScenarioContext, ScenarioDefinition } from '../../harness/types.js';
import { runBenchmarks } from './benchmarks.js';
import {
  testAsyncDependency,
  testConcurrentPromises,
  testEmptyIterator,
  testErrorAndRetryRace,
  testIteratorSemantics,
  testMultipleSubscribers,
  testNestedErrored,
  testNestedLoading,
  testPromiseResolvingToIterable,
  testRapidInvalidationAndRace,
} from './cases.js';
import { instrumentHost } from './instrumentation.js';

async function runAsyncStress(context: ScenarioContext): Promise<void> {
  console.log(`STING_DEBUG_UNIVERSAL_CREATE_RENDERER=${String(debugCreateRenderer)}`);
  console.log(`STING_DEBUG_SOLID_ERRORED=${String(debugErrored)}`);

  const instrumentation = instrumentHost();
  try {
    await testMultipleSubscribers(context, instrumentation);
    await testAsyncDependency(context, instrumentation);
    await testConcurrentPromises(context, instrumentation);
    await testRapidInvalidationAndRace(context, instrumentation);
    await testErrorAndRetryRace(context, instrumentation);
    await testNestedLoading(context, instrumentation);
    await testNestedErrored(context, instrumentation);
    await testIteratorSemantics(context, instrumentation);
    await testEmptyIterator(context, instrumentation);
    await testPromiseResolvingToIterable(context, instrumentation);
    await runBenchmarks(context, instrumentation);
  } finally {
    instrumentation.restore();
  }
}

export const scenario = {
  id: 'async-stress',
  title: 'Solid 2 async stress, races, boundaries, and streams',
  workstream: 'async-stress',
  kind: 'hybrid',
  run: runAsyncStress,
} satisfies ScenarioDefinition;