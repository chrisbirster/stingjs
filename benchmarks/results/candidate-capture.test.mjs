import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CandidateCaptureError,
  candidateCaptureToEvidence,
  validateCandidateCaptureDocument,
} from './candidate-capture.mjs';
import { validateResult } from './tool.mjs';

function document(overrides = {}) {
  const base = {
    captureDocumentVersion: 1,
    role: 'decision-evidence',
    metadata: {
      benchmarkCommit: '0123456789abcdef0123456789abcdef01234567',
      recordedAt: '2026-08-26T23:00:00Z',
      platform: 'android',
      environment: 'physical-device',
      device: 'Test Phone',
      deviceArchitecture: 'arm64-v8a',
      osVersion: 'Android 16',
      build: 'release',
      system: 'sting',
      engine: 'quickjs-ng',
      engineVersion: '0.16.1',
      frameworkVersion: 'sting-test',
      displayRefreshHz: 120,
      toolchain: { zig: '0.16.0' },
    },
    captures: [
      {
        scenario: 'sparse-10k-row-4281',
        metric: 'native-event-to-native-commit-round-trip',
        unit: 'ms',
        direction: 'lower-is-better',
        samples: [1, 2, 3],
        tags: { mutationsPerSample: '1' },
      },
    ],
  };

  return {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata ?? {}),
    },
    captures: overrides.captures ?? base.captures,
  };
}

test('converts physical candidate capture into schema-v1 evidence', () => {
  const converted = candidateCaptureToEvidence(document(), 'capture.json');
  assert.equal(converted.length, 1);
  assert.equal(
    converted[0].filename,
    'sting-quickjs-ng-android-sparse-10k-row-4281-native-event-to-native-commit-round-trip.json',
  );
  assert.equal(converted[0].result.metadata.sampleCount, 3);
  assert.equal(validateResult(converted[0].result), converted[0].result);
});

test('rejects JavaScriptCore as decision evidence', () => {
  assert.throws(
    () => validateCandidateCaptureDocument(document({metadata: {engine: 'javascriptcore'}})),
    /JavaScriptCore is semantic-control only/,
  );
});

test('rejects simulator, emulator, and debug captures before conversion', () => {
  assert.throws(
    () => candidateCaptureToEvidence(document({metadata: {environment: 'simulator'}})),
    /physical-device/,
  );
  assert.throws(
    () => candidateCaptureToEvidence(document({metadata: {environment: 'emulator'}})),
    /physical-device/,
  );
  assert.throws(
    () => candidateCaptureToEvidence(document({metadata: {build: 'debug'}})),
    /build=release/,
  );
});

test('requires React Native capture documents to use Hermes', () => {
  assert.throws(
    () => candidateCaptureToEvidence(
      document({metadata: {system: 'react-native', engine: 'quickjs'}}),
    ),
    /React Native decision evidence must use Hermes/,
  );
});

test('rejects duplicate output filenames rather than overwriting evidence', () => {
  const one = document().captures[0];
  assert.throws(
    () => candidateCaptureToEvidence(document({captures: [one, {...one, samples: [4, 5, 6]}]})),
    CandidateCaptureError,
  );
});
