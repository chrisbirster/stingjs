import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scaffoldStingModule } from './module-scaffold.js';
import { validateModuleManifest } from './modules.js';

test('scaffolds a schema-valid third-party Sting module without monorepo paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sting-module-scaffold-'));
  const target = join(root, 'camera-tools');
  try {
    const result = await scaffoldStingModule({
      targetDir: target,
      moduleName: 'CameraTools',
      packageName: '@acme/sting-camera-tools',
      androidPackage: 'com.acme.sting.camera',
    });

    assert.equal(result.moduleName, 'CameraTools');
    const manifest = validateModuleManifest(
      JSON.parse(await readFile(join(target, 'sting-module.json'), 'utf8')),
      'fixture',
    );
    assert.equal(manifest.package, '@acme/sting-camera-tools');
    assert.equal(manifest.android.factory, 'context');
    assert.equal(manifest.ios.factory, 'default');

    const files = [
      'package.json',
      'sting-module.json',
      'src/index.ts',
      'src/index.test.ts',
      'Package.swift',
      'ios/CameraToolsModule.swift',
      'android/build.gradle.kts',
      'android/src/main/java/com/acme/sting/camera/CameraToolsModule.kt',
      'README.md',
    ];
    for (const file of files) {
      const content = await readFile(join(target, file), 'utf8');
      assert.doesNotMatch(content, /\.\.\/\.\.\/\.\.\/(?:native|packages|runtime)\//);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid package and Android identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sting-module-scaffold-invalid-'));
  try {
    await assert.rejects(
      scaffoldStingModule({ targetDir: join(root, 'one'), packageName: 'Bad Package' }),
      /Invalid npm package name/,
    );
    await assert.rejects(
      scaffoldStingModule({ targetDir: join(root, 'two'), androidPackage: 'Bad.Package' }),
      /Invalid Android package/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
