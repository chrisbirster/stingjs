import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BenchmarkCaptureError,
  controlCaptureDocument,
  parseBenchmarkCaptures,
  validateBenchmarkCapture,
} from './capture.mjs';

function capture(overrides = {}) {
  return {
    captureVersion: 1,
    controlRuntime: 'javascriptcore',
    scenario: 'sparse-10k-row-4281',
    metric: 'native-event-to-native-commit-round-trip',
    unit: 'ms',
    direction: 'lower-is-better',
    warmupIterations: 5,
    sampleCount: 2,
    samples: [1.25, 1.5],
    nativeMutationMetric: 'replaceText',
    nativeMutationsPerSample: 1,
    nativeMutationCount: 2,
    nativeMutationSamples: [0.1, 0.2],
    ...overrides,
  };
}

test('parses capture markers from noisy xcodebuild output', () => {
  const first = capture();
  const second = capture({
    scenario: 'dense-10k-100-rows',
    nativeMutationsPerSample: 100,
    nativeMutationCount: 200,
    nativeMutationSamples: Array.from({length: 200}, (_, index) => index / 1000),
  });
  const log = [
    'Test Suite started',
    `2026-08-26 19:00:00 STING_BENCHMARK_CAPTURE=${JSON.stringify(first)}`,
    'some XCTest noise',
    `STING_BENCHMARK_CAPTURE=${JSON.stringify(second)}`,
  ].join('\n');

  const parsed = parseBenchmarkCaptures(log, 'device.log');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].scenario, 'sparse-10k-row-4281');
  assert.equal(parsed[1].nativeMutationCount, 200);
});

test('rejects mismatched sample counts', () => {
  assert.throws(
    () => validateBenchmarkCapture(capture({sampleCount: 3})),
    BenchmarkCaptureError,
  );
});

test('rejects mismatched native mutation counts', () => {
  assert.throws(
    () => validateBenchmarkCapture(capture({nativeMutationCount: 1})),
    /nativeMutationCount/,
  );
});

test('wraps control captures without presenting them as engine evidence', () => {
  const document = controlCaptureDocument([capture()], {
    device: 'Example iPhone',
    build: 'release',
  });

  assert.equal(document.role, 'semantic-control');
  assert.equal(document.engine, 'javascriptcore');
  assert.equal(document.captures.length, 1);
});
