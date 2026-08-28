import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectProjectDoctorContext } from './doctor.js';

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'sting-doctor-'));
}

function writePackage(root: string): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }), 'utf8');
}

test('project doctor loads config and detects configured native targets', async () => {
  const root = tempProject();
  writePackage(root);
  mkdirSync(join(root, 'ios', 'MyApp.xcodeproj'), { recursive: true });
  mkdirSync(join(root, 'android'), { recursive: true });
  writeFileSync(join(root, 'android', 'gradlew'), '#!/bin/sh\n', 'utf8');
  writeFileSync(join(root, 'sting.config.mjs'), `export default {
    ios: { project: 'ios/MyApp.xcodeproj' },
    android: { directory: 'android' },
  };\n`, 'utf8');

  const result = await collectProjectDoctorContext(root);
  assert.deepEqual(result.platforms, { ios: true, android: true });
  assert.equal(result.androidGradleWrapper, true);
  assert.equal(result.requiresSystemGradle, false);
  assert.equal(result.checks.find((check) => check.name === 'sting config')?.ok, true);
  assert.equal(result.checks.find((check) => check.name === 'package.json')?.ok, true);
  assert.equal(result.checks.find((check) => check.name === 'build script')?.ok, true);
  assert.equal(result.checks.find((check) => check.name === 'ios project')?.ok, true);
  assert.equal(result.checks.find((check) => check.name === 'android project directory')?.ok, true);
});

test('project doctor infers Android without config and allows system Gradle fallback', async () => {
  const root = tempProject();
  writePackage(root);
  mkdirSync(join(root, 'android'), { recursive: true });

  const result = await collectProjectDoctorContext(root);
  assert.deepEqual(result.platforms, { ios: false, android: true });
  assert.equal(result.requiresSystemGradle, true);
  const config = result.checks.find((check) => check.name === 'sting config');
  assert.equal(config?.required, false);
  assert.equal(config?.skipped, true);
  const wrapper = result.checks.find((check) => check.name === 'android gradle wrapper');
  assert.equal(wrapper?.ok, false);
  assert.equal(wrapper?.required, false);
});

test('project doctor fails a configured native path that does not exist', async () => {
  const root = tempProject();
  writePackage(root);
  writeFileSync(join(root, 'sting.config.mjs'), `export default { ios: { project: 'ios/Missing.xcodeproj' } };\n`, 'utf8');

  const result = await collectProjectDoctorContext(root);
  const iosProject = result.checks.find((check) => check.name === 'ios project');
  assert.equal(iosProject?.required, true);
  assert.equal(iosProject?.ok, false);
  assert.match(iosProject?.detail ?? '', /does not exist/);
});

test('project doctor reports an invalid config as a required failure', async () => {
  const root = tempProject();
  writePackage(root);
  writeFileSync(join(root, 'sting.config.mjs'), 'export default { name: 42 };\n', 'utf8');

  const result = await collectProjectDoctorContext(root);
  const config = result.checks.find((check) => check.name === 'sting config');
  assert.equal(config?.required, true);
  assert.equal(config?.ok, false);
  assert.match(config?.detail ?? '', /name must be a string/);
});

test('project doctor requires the normal npm build contract', async () => {
  const root = tempProject();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');

  const result = await collectProjectDoctorContext(root);
  const build = result.checks.find((check) => check.name === 'build script');
  assert.equal(build?.required, true);
  assert.equal(build?.ok, false);
});
