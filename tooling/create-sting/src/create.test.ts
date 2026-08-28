import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStingProject } from './create.js';

function fixture(): { root: string; artifacts: string; target: string } {
  const root = mkdtempSync(join(tmpdir(), 'create-sting-'));
  const artifacts = join(root, 'artifacts');
  const target = join(root, 'my-app');
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(artifacts, 'sting-runtime.aar'), 'runtime-aar');
  writeFileSync(join(artifacts, 'sting-quickjs.aar'), 'quickjs-aar');
  return { root, artifacts, target };
}

test('creates an external Android Sting project from prebuilt host artifacts', () => {
  const { artifacts, target } = fixture();
  const result = createStingProject({
    targetDir: target,
    projectName: 'my-app',
    androidPackage: 'com.example.myapp',
    runtimeArtifactsDir: artifacts,
  });

  assert.equal(result.projectName, 'my-app');
  assert.equal(result.androidPackage, 'com.example.myapp');

  const packageJson = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
    name: string;
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.name, 'my-app');
  assert.equal(packageJson.scripts.test, 'vitest run --passWithNoTests');
  assert.equal(readFileSync(join(target, 'android/app/libs/sting-runtime.aar'), 'utf8'), 'runtime-aar');
  assert.equal(readFileSync(join(target, 'android/app/libs/sting-quickjs.aar'), 'utf8'), 'quickjs-aar');

  const gradlew = readFileSync(join(target, 'android/gradlew'), 'utf8');
  const gradlewBat = readFileSync(join(target, 'android/gradlew.bat'), 'utf8');
  assert.match(gradlew, /VERSION=9\.5\.0/);
  assert.match(gradlewBat, /set VERSION=9\.5\.0/);

  if (process.platform !== 'win32') {
    const mode = statSync(join(target, 'android/gradlew')).mode;
    assert.notEqual(mode & 0o100, 0, 'generated android/gradlew must be executable');
  }

  const activity = readFileSync(
    join(target, 'android/app/src/main/java/com/example/myapp/MainActivity.kt'),
    'utf8',
  );
  assert.match(activity, /^package com\.example\.myapp/m);
  assert.match(activity, /OfficialQuickJsCandidateRuntime/);

  const config = readFileSync(join(target, 'sting.config.ts'), 'utf8');
  assert.match(config, /package: 'com\.example\.myapp'/);

  for (const path of [
    'android/settings.gradle.kts',
    'android/app/build.gradle.kts',
    'android/app/src/main/java/com/example/myapp/MainActivity.kt',
  ]) {
    const contents = readFileSync(join(target, path), 'utf8');
    assert.doesNotMatch(contents, /\.\.\/\.\.\/\.\.\/(?:native|packages|runtime)\//);
  }
});

test('rejects a non-empty target unless force is used', () => {
  const { artifacts, target } = fixture();
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'existing.txt'), 'keep me');
  assert.throws(
    () => createStingProject({ targetDir: target, runtimeArtifactsDir: artifacts }),
    /Target directory is not empty/,
  );
});

test('requires distributable Android host artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-sting-missing-'));
  assert.throws(
    () => createStingProject({ targetDir: join(root, 'app'), runtimeArtifactsDir: join(root, 'missing') }),
    /Sting Android host artifacts were not found/,
  );
});
