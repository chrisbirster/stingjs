import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { StingGoClientReport } from './protocol.js';
import { startStingServer } from './start.js';

test('startStingServer serves the complete Sting Go v1 manifest and built bundle', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sting-cli-'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@example/demo' }));
  writeFileSync(join(root, 'dist', 'sting-app.js'), 'globalThis.__stingDemo = true;');

  const started = await startStingServer({
    projectRoot: root,
    host: '127.0.0.1',
    port: 0,
  });

  try {
    const manifestResponse = await fetch(started.manifestUrl);
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.project.name, '@example/demo');
    assert.equal(manifest.engine, 'quickjs');
    assert.equal(manifest.bundle.path, '/bundle');
    assert.equal(manifest.development.reload.path, '/events');
    assert.equal(manifest.development.reload.transport, 'sse');
    assert.equal(manifest.development.health.path, '/health');
    assert.equal(manifest.development.report.path, '/report');
    assert.equal(manifest.development.report.method, 'POST');

    const bundleUrl = new URL(manifest.bundle.path, started.manifestUrl);
    const bundleResponse = await fetch(bundleUrl);
    assert.equal(bundleResponse.status, 200);
    assert.equal(await bundleResponse.text(), 'globalThis.__stingDemo = true;');
    assert.match(started.stingGoUrl, /^sting:\/\/go\?url=/);
  } finally {
    await started.close();
  }
});

test('startStingServer accepts validated Sting Go client reports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sting-cli-report-'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'sting-app.js'), 'globalThis.__stingDemo = true;');
  const reports: StingGoClientReport[] = [];

  const started = await startStingServer({
    projectRoot: root,
    host: '127.0.0.1',
    port: 0,
    onClientReport: (report) => reports.push(report),
  });

  try {
    const response = await fetch(started.reportUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'runtime',
        platform: 'android',
        message: 'ReferenceError: missingValue is not defined',
        detail: 'sting-app.js:12',
      }),
    });
    assert.equal(response.status, 204);
    assert.deepEqual(reports, [{
      kind: 'runtime',
      platform: 'android',
      message: 'ReferenceError: missingValue is not defined',
      detail: 'sting-app.js:12',
    }]);
  } finally {
    await started.close();
  }
});

test('startStingServer rejects malformed and oversized Sting Go reports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sting-cli-report-invalid-'));
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'sting-app.js'), 'globalThis.__stingDemo = true;');

  const started = await startStingServer({ projectRoot: root, host: '127.0.0.1', port: 0 });
  try {
    const malformed = await fetch(started.reportUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'runtime', platform: 'android', message: '' }),
    });
    assert.equal(malformed.status, 400);

    const oversized = await fetch(started.reportUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'runtime', platform: 'android', message: 'x'.repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await started.close();
  }
});
