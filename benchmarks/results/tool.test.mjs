import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EvidenceValidationError,
  percentile,
  summarizeResult,
  validateResult,
} from './tool.mjs';

function makeResult(overrides = {}) {
  const result = {
    schemaVersion: 1,
    metadata: {
      benchmarkCommit: '0123456789abcdef0123456789abcdef01234567',
      recordedAt: '2026-08-26T20:00:00.000Z',
      platform: 'ios',
      environment: 'physical-device',
      device: 'Test Device',
      deviceArchitecture: 'arm64',
      osVersion: 'Test OS 1.0',
      build: 'release',
      system: 'sting',
      engine: 'quickjs-ng',
      engineVersion: 'v0.16.1',
      frameworkVersion: 'sting-test',
      displayRefreshHz: 120,
      sampleCount: 5,
      toolchain: {
        zig: '0.16.0',
      },
    },
    measurement: {
      scenario: 'sparse-10k-row-update',
      metric: 'state-to-native-visible-latency',
      unit: 'ms',
      direction: 'lower-is-better',
      samples: [1, 2, 3, 4, 10],
    },
  };

  return {
    ...result,
    ...overrides,
    metadata: {
      ...result.metadata,
      ...(overrides.metadata ?? {}),
    },
    measurement: {
      ...result.measurement,
      ...(overrides.measurement ?? {}),
    },
  };
}

test('accepts valid release physical-device evidence shape', () => {
  const result = makeResult();
  assert.equal(validateResult(result), result);
});

test('rejects simulator or emulator evidence', () => {
  const result = makeResult({
    metadata: { environment: 'simulator' },
  });

  assert.throws(
    () => validateResult(result),
    /environment must equal "physical-device"/,
  );
});

test('rejects debug evidence and sample-count mismatches', () => {
  const result = makeResult({
    metadata: {
      build: 'debug',
      sampleCount: 4,
    },
  });

  assert.throws(
    () => validateResult(result, 'bad.json'),
    error => {
      assert.ok(error instanceof EvidenceValidationError);
      assert.match(error.message, /build must equal "release"/);
      assert.match(error.message, /sampleCount \(4\) must equal raw sample length \(5\)/);
      return true;
    },
  );
});

test('requires React Native baseline evidence to use Hermes', () => {
  const result = makeResult({
    metadata: {
      system: 'react-native',
      engine: 'quickjs',
    },
  });

  assert.throws(
    () => validateResult(result),
    /React Native baseline evidence must use the Hermes engine/,
  );
});

test('rejects non-finite, negative, and unretained samples', () => {
  const negative = makeResult({
    metadata: { sampleCount: 1 },
    measurement: { samples: [-1] },
  });
  assert.throws(() => validateResult(negative), /finite non-negative number/);

  const infinite = makeResult({
    metadata: { sampleCount: 1 },
    measurement: { samples: [Infinity] },
  });
  assert.throws(() => validateResult(infinite), /finite non-negative number/);

  const empty = makeResult({
    metadata: { sampleCount: 1 },
    measurement: { samples: [] },
  });
  assert.throws(() => validateResult(empty), /non-empty array/);
});

test('uses nearest-rank percentiles', () => {
  const samples = [1, 2, 3, 4, 10];
  assert.equal(percentile(samples, 0.5), 3);
  assert.equal(percentile(samples, 0.95), 10);
  assert.equal(percentile(samples, 0.99), 10);
});

test('summarizes latency and reports display-frame budget misses', () => {
  const result = makeResult();
  const summary = summarizeResult(result, 'fixture.json');

  assert.equal(summary.source, 'fixture.json');
  assert.equal(summary.measurement.sampleCount, 5);
  assert.equal(summary.measurement.min, 1);
  assert.equal(summary.measurement.mean, 4);
  assert.equal(summary.measurement.p50, 3);
  assert.equal(summary.measurement.p95, 10);
  assert.equal(summary.measurement.p99, 10);
  assert.equal(summary.measurement.max, 10);
  assert.ok(Math.abs(summary.measurement.frameBudgetMs - 8.333333333333334) < 1e-12);
  assert.equal(summary.measurement.frameBudgetMissCount, 1);
  assert.equal(summary.measurement.frameBudgetMissPercent, 20);
});

test('does not invent frame-budget statistics for non-time units', () => {
  const result = makeResult({
    measurement: {
      metric: 'resident-memory',
      unit: 'bytes',
      samples: [100, 110, 120, 130, 140],
    },
  });
  const summary = summarizeResult(result);

  assert.equal(Object.hasOwn(summary.measurement, 'frameBudgetMs'), false);
  assert.equal(Object.hasOwn(summary.measurement, 'frameBudgetMissCount'), false);
});
