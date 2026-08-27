import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defineConfig, findStingConfig, loadStingConfig } from './config.js';

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'sting-config-'));
}

test('defineConfig returns the same typed config object', () => {
  const config = defineConfig({
    name: 'Example',
    ios: { bundleIdentifier: 'com.example.app' },
    android: { package: 'com.example.app' },
  });
  assert.equal(config.name, 'Example');
  assert.equal(config.ios?.bundleIdentifier, 'com.example.app');
  assert.equal(config.android?.package, 'com.example.app');
});

test('findStingConfig prefers sting.config.ts', () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'sting.config.mjs'), 'export default {}');
    writeFileSync(join(root, 'sting.config.ts'), 'export default {}');
    assert.equal(findStingConfig(root), join(root, 'sting.config.ts'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadStingConfig loads TypeScript syntax on the Node 22.12 floor', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'sting.config.ts'), `
      type AppName = string;
      const name: AppName = 'Fixture App';
      export default {
        name,
        bundle: 'build/sting.js',
        ios: {
          project: 'ios/Fixture.xcodeproj',
          scheme: 'Fixture',
          bundleIdentifier: 'com.example.fixture',
        },
        android: {
          directory: 'android',
          package: 'com.example.fixture',
          variant: 'debug',
        },
      } satisfies Record<string, unknown>;
    `);

    const loaded = await loadStingConfig(root);
    assert.equal(loaded?.path, join(root, 'sting.config.ts'));
    assert.deepEqual(loaded?.config, {
      name: 'Fixture App',
      bundle: 'build/sting.js',
      ios: {
        project: 'ios/Fixture.xcodeproj',
        scheme: 'Fixture',
        bundleIdentifier: 'com.example.fixture',
      },
      android: {
        directory: 'android',
        package: 'com.example.fixture',
        variant: 'debug',
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadStingConfig returns undefined when a project has no config', async () => {
  const root = fixture();
  try {
    assert.equal(await loadStingConfig(root), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadStingConfig rejects an invalid default export', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'sting.config.mjs'), `export default 'invalid';`);
    await assert.rejects(() => loadStingConfig(root), /must default-export a Sting config object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
