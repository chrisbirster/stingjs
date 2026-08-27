import assert from 'node:assert/strict';
import test from 'node:test';
import { createStingGoManifest } from './protocol.js';

test('createStingGoManifest is deterministic and production-engine specific', () => {
  const manifest = createStingGoManifest({
    projectName: '@example/app',
    capabilities: ['clipboard', 'haptics', 'clipboard'],
  });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.runtimeVersion, '0.1.0');
  assert.equal(manifest.engine, 'quickjs');
  assert.equal(manifest.project.name, '@example/app');
  assert.deepEqual(manifest.capabilities, ['clipboard', 'haptics']);
  assert.equal(manifest.bundle.path, '/bundle');
});
