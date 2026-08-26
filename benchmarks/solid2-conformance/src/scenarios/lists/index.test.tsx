import { describe, expect, it } from 'vitest';
import { scenario } from './index.js';
import type { AssertionRecord, MetricRecord, ScenarioContext } from '../../harness/types.js';

describe('Solid 2 list conformance', () => {
  it('passes native identity/mutation assertions and emits the required benchmark distribution metrics', async () => {
    const assertions: AssertionRecord[] = [];
    const metrics: MetricRecord[] = [];
    const context: ScenarioContext = {
      assert(name, condition, detail) {
        assertions.push({
          name,
          passed: condition,
          ...(detail === undefined ? {} : { detail }),
        });
        if (!condition) {
          throw new Error(detail === undefined ? name : `${name}: ${detail}`);
        }
      },
      metric(name, value, unit) {
        metrics.push({ name, value, unit });
      },
      now() {
        return performance.now();
      },
    };

    await scenario.run(context);

    expect(assertions.length).toBeGreaterThan(70);
    expect(assertions.every(assertion => assertion.passed)).toBe(true);

    const metricNames = new Set(metrics.map(metric => metric.name));
    const benchmarkNames = [
      'mount-1000',
      'mount-10000',
      'insert-middle-1k',
      'remove-middle-1k',
      'reverse-1k',
      'sort-1k',
      'sparse-update-1-of-10k',
      'dense-update-100-of-10k',
      'filter-10k-to-5k',
      'expand-5k-to-10k',
    ];

    for (const benchmarkName of benchmarkNames) {
      for (const statistic of ['samples', 'min', 'mean', 'p50', 'p95', 'p99', 'max']) {
        expect(metricNames.has(`${benchmarkName}.${statistic}`), `${benchmarkName}.${statistic}`).toBe(true);
      }
      for (const mutation of [
        'createElement',
        'createTextNode',
        'replaceText',
        'setProperty',
        'insertNode',
        'removeNode',
        'setEventEnabled',
      ]) {
        expect(
          metricNames.has(`${benchmarkName}.native.${mutation}.mean`),
          `${benchmarkName}.native.${mutation}.mean`,
        ).toBe(true);
      }
    }
  }, 120_000);
});
