import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createModulePlan,
  discoverInstalledStingModules,
  renderAndroidRegistry,
  renderIOSRegistry,
  synchronizeModuleAutolinking,
  type StingModuleManifest,
} from './modules.js';

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true }).catch(() => undefined);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeModule(
  projectRoot: string,
  packageName: string,
  manifest: StingModuleManifest,
  dependencies: Record<string, string> = {},
): Promise<string> {
  const root = join(projectRoot, 'node_modules', packageName);
  await mkdir(join(root, 'android', 'src', 'main', 'java', 'com', 'example'), { recursive: true });
  await mkdir(join(root, 'ios'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: packageName, version: manifest.version, dependencies }), 'utf8');
  await writeFile(join(root, 'sting-module.json'), JSON.stringify(manifest), 'utf8');
  await writeFile(join(root, 'android', 'src', 'main', 'java', 'com', 'example', `${manifest.name}Module.kt`), `package com.example\nclass ${manifest.name}Module\n`, 'utf8');
  await writeFile(join(root, 'ios', `${manifest.name}Module.swift`), `public final class ${manifest.name}Module {}\n`, 'utf8');
  return root;
}

function manifest(name: string, packageName: string, androidFactory: 'default' | 'context' = 'default'): StingModuleManifest {
  return {
    schemaVersion: 1,
    name,
    package: packageName,
    version: '1.0.0',
    ios: { module: `${name}Module`, factory: 'default', permissions: [] },
    android: { module: `com.example.${name}Module`, factory: androidFactory, permissions: [] },
    capabilities: ['sync-functions'],
  };
}

test('creates a deterministic plan and renders native factories', () => {
  const plan = createModulePlan([
    { root: '/b', manifest: manifest('Location', '@example/location', 'context') },
    { root: '/a', manifest: manifest('Device', '@example/device') },
  ]);

  assert.deepEqual(plan.modules.map(module => module.package), ['@example/device', '@example/location']);
  assert.match(renderAndroidRegistry(plan), /StingAutolinkModule1\(context\)/);
  assert.match(renderIOSRegistry(plan), /LocationModule\(\)/);
});

test('rejects duplicate native module names even when packages differ', () => {
  const first = manifest('Camera', '@example/camera');
  const second = { ...manifest('Other', '@example/other'), name: 'Camera' };
  assert.throws(
    () => createModulePlan([{ root: '/a', manifest: first }, { root: '/b', manifest: second }]),
    /Duplicate Sting native module name Camera/,
  );
});

test('discovers Sting modules through the installed dependency graph and materializes native inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sting-autolink-'));
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'consumer',
      dependencies: { '@example/feature': '1.0.0' },
    }), 'utf8');
    const featureRoot = join(root, 'node_modules', '@example', 'feature');
    await mkdir(featureRoot, { recursive: true });
    await writeFile(join(featureRoot, 'package.json'), JSON.stringify({
      name: '@example/feature',
      version: '1.0.0',
      dependencies: { '@example/device': '1.0.0', '@example/location': '1.0.0' },
    }), 'utf8');
    await writeModule(root, '@example/device', manifest('Device', '@example/device'));
    await writeModule(root, '@example/location', manifest('Location', '@example/location', 'context'));

    const discovered = await discoverInstalledStingModules(root);
    assert.deepEqual(discovered.map(record => record.manifest.package), ['@example/device', '@example/location']);

    const plan = await synchronizeModuleAutolinking(root);
    assert.equal(plan.modules.length, 2);
    const android = await readFile(
      join(root, '.sting', 'generated', 'android', 'src', 'main', 'java', 'run', 'stingjs', 'generated', 'StingGeneratedModules.kt'),
      'utf8',
    );
    assert.match(android, /DeviceModule/);
    assert.match(android, /LocationModule/);
    assert.match(android, /\(context\)/);

    const swift = await readFile(
      join(root, '.sting', 'generated', 'ios', 'Sources', 'StingGeneratedModules', 'Registry.swift'),
      'utf8',
    );
    assert.match(swift, /DeviceModule\(\)/);
    assert.match(swift, /LocationModule\(\)/);
    assert.equal(
      await readFile(
        join(root, '.sting', 'generated', 'ios', 'Sources', 'StingGeneratedModules', 'example__location', 'LocationModule.swift'),
        'utf8',
      ),
      'public final class LocationModule {}\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
