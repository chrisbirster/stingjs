import { describe, expect, it } from 'vitest';
import { scenario } from './index.js';
import type { AssertionRecord, MetricRecord, ScenarioContext } from '../../harness/types.js';

describe('Solid 2 lifecycle conformance', () => {
  it('passes the complete deterministic lifecycle scenario', async () => {
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

    expect(assertions.length).toBeGreaterThanOrEqual(40);
    expect(assertions.every(assertion => assertion.passed)).toBe(true);

    const metricNames = new Set(metrics.map(metric => metric.name));
    for (const prefix of ['create-root-1k', 'create-root-10k', 'native-mount-unmount-1k']) {
      for (const stat of ['samples', 'min', 'mean', 'p50', 'p95', 'p99', 'max']) {
        expect(metricNames.has(`${prefix}.${stat}`)).toBe(true);
      }
    }

    for (const mutation of [
      'native.createElement',
      'native.createTextNode',
      'native.replaceText',
      'native.setProperty',
      'native.insertNode',
      'native.removeNode',
      'native.eventEnable',
      'native.eventDisable',
    ]) {
      expect(metricNames.has(mutation)).toBe(true);
    }
  });
});
