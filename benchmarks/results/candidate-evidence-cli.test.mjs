import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCandidateEvidenceCli } from './candidate-evidence-cli.mjs';

function captureDocument() {
  return {
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
      engine: 'hermes',
      engineVersion: 'test-hermes',
      frameworkVersion: 'sting-test',
      displayRefreshHz: 120,
    },
    captures: [
      {
        scenario: 'sparse-10k-row-4281',
        metric: 'native-event-to-native-commit-round-trip',
        unit: 'ms',
        direction: 'lower-is-better',
        samples: [1, 2, 3],
      },
      {
        scenario: 'dense-10k-100-rows',
        metric: 'native-event-to-native-commit-round-trip',
        unit: 'ms',
        direction: 'lower-is-better',
        samples: [4, 5, 6],
      },
    ],
  };
}

test('writes one validated evidence file per capture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sting-evidence-'));
  try {
    const capturePath = join(directory, 'capture.json');
    const outputPath = join(directory, 'raw');
    await writeFile(capturePath, JSON.stringify(captureDocument()), 'utf8');

    await runCandidateEvidenceCli([capturePath, outputPath]);

    const files = (await readdir(outputPath)).sort();
    assert.equal(files.length, 2);
    const sparse = JSON.parse(await readFile(join(outputPath, files[1]), 'utf8'));
    assert.equal(sparse.schemaVersion, 1);
    assert.equal(sparse.metadata.environment, 'physical-device');
    assert.equal(sparse.metadata.sampleCount, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preflights all destinations so a collision creates no partial outputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sting-evidence-'));
  try {
    const capturePath = join(directory, 'capture.json');
    const outputPath = join(directory, 'raw');
    await writeFile(capturePath, JSON.stringify(captureDocument()), 'utf8');
    await runCandidateEvidenceCli([capturePath, outputPath]);

    const before = (await readdir(outputPath)).sort();
    await assert.rejects(
      () => runCandidateEvidenceCli([capturePath, outputPath]),
      /evidence file already exists/,
    );
    const after = (await readdir(outputPath)).sort();
    assert.deepEqual(after, before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
