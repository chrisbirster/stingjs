import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStingGoCompatibility, createStingGoManifest } from './protocol.js';

test('createStingGoManifest is deterministic and publishes the complete v1 development contract', () => {
  const manifest = createStingGoManifest({
    projectName: '@example/app',
    capabilities: ['clipboard', 'haptics', 'clipboard'],
  });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.runtimeVersion, '0.1.0');
  assert.equal(manifest.engine, 'quickjs');
  assert.equal(manifest.project.name, '@example/app');
  assert.deepEqual(manifest.capabilities, ['clipboard', 'haptics']);
  assert.deepEqual(manifest.bundle, {
    path: '/bundle',
    contentType: 'application/javascript',
  });
  assert.deepEqual(manifest.development, {
    reload: {
      path: '/events',
      transport: 'sse',
      contentType: 'text/event-stream',
    },
    health: {
      path: '/health',
      contentType: 'application/json',
    },
  });
});

test('Sting Go compatibility accepts an exact runtime with a capability superset', () => {
  const manifest = createStingGoManifest({
    projectName: '@example/app',
    runtimeVersion: '0.1.0',
    capabilities: ['clipboard', 'haptics'],
  });

  assert.deepEqual(
    checkStingGoCompatibility(manifest, {
      runtimeVersion: '0.1.0',
      capabilities: ['device', 'haptics', 'clipboard'],
    }),
    { compatible: true, reasons: [] },
  );
});

test('Sting Go compatibility reports runtime and capability mismatches together', () => {
  const manifest = createStingGoManifest({
    projectName: '@example/app',
    runtimeVersion: '0.2.0',
    capabilities: ['camera', 'clipboard'],
  });

  const result = checkStingGoCompatibility(manifest, {
    runtimeVersion: '0.1.0',
    capabilities: ['clipboard'],
  });

  assert.equal(result.compatible, false);
  assert.deepEqual(result.reasons, [
    'Runtime version mismatch: project requires 0.2.0, client provides 0.1.0',
    'Unsupported Sting capabilities: camera',
  ]);
});
