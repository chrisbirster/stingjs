import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startStingServer } from './start.js';

test('startStingServer serves a manifest and built bundle', async () => {
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

    const bundleUrl = new URL('/bundle', started.manifestUrl);
    const bundleResponse = await fetch(bundleUrl);
    assert.equal(bundleResponse.status, 200);
    assert.equal(await bundleResponse.text(), 'globalThis.__stingDemo = true;');
    assert.match(started.stingGoUrl, /^sting:\/\/go\?url=/);
  } finally {
    await started.close();
  }
});
