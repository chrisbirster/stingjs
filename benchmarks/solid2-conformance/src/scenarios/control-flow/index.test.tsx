import { describe, expect, it } from 'vitest';
import type { AssertionRecord, MetricRecord, ScenarioContext } from '../../harness/types.js';
import { scenario } from './index.js';

describe('Solid 2 control-flow conformance', () => {
  it('passes the complete deterministic native control-flow scenario', async () => {
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

    expect(assertions.length).toBeGreaterThan(50);
    expect(assertions.every(assertion => assertion.passed)).toBe(true);
    expect(metrics.find(metric => metric.name === 'rapid-branch.samples')?.value).toBe(20);
    expect(metrics.find(metric => metric.name === 'rapid-branch.native.createElement')?.value).toBe(1000);
    expect(metrics.find(metric => metric.name === 'rapid-branch.native.insertNode')?.value).toBe(1000);
    expect(metrics.find(metric => metric.name === 'rapid-branch.native.removeNode')?.value).toBe(1000);
    expect(metrics.find(metric => metric.name === 'rapid-branch.native.setEventEnabled')?.value).toBe(2000);
  });
});
