import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectProjectDoctorContext, supportsSolid2 } from './doctor.js';

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'sting-doctor-'));
}

function writePackage(root: string, solid = '2.0.0-rc.1'): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { build: 'vite build' },
    dependencies: {
      '@stingjs/solid': '0.1.0',
      'solid-js': solid,
    },
  }), 'utf8');
}

test('supportsSolid2 accepts common Solid 2 declarations', () => {
  assert.equal(supportsSolid2('2.0.0-rc.1'), true);
  assert.equal(supportsSolid2('^2.0.0'), true);
  assert.equal(supportsSolid2('>=2.0.0-rc.1 <3'), true);
  assert.equal(supportsSolid2('workspace:*'), true);
  assert.equal(supportsSolid2('^1.9.0'), false);
  assert.equal(supportsSolid2('^3.0.0'), false);
});

test('project doctor loads config and detects configured native targets', async () => {
  const root = tempProject();
  try {
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
    assert.equal(result.checks.find((check) => check.name === '@stingjs/solid')?.ok, true);
    assert.equal(result.checks.find((check) => check.name === 'solid-js 2')?.ok, true);
    assert.equal(result.checks.find((check) => check.name === 'sting config')?.ok, true);
    assert.equal(result.checks.find((check) => check.name === 'ios project')?.ok, true);
    assert.equal(result.checks.find((check) => check.name === 'android project')?.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project doctor infers Android without config and allows system Gradle fallback', async () => {
  const root = tempProject();
  try {
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit target limits project checks to that native platform', async () => {
  const root = tempProject();
  try {
    writePackage(root);
    mkdirSync(join(root, 'ios'), { recursive: true });
    mkdirSync(join(root, 'android'), { recursive: true });
    writeFileSync(join(root, 'android', 'gradlew'), '#!/bin/sh\n', 'utf8');

    const result = await collectProjectDoctorContext(root, 'android');
    assert.deepEqual(result.platforms, { ios: false, android: true });
    assert.equal(result.checks.some((check) => check.name === 'ios project'), false);
    assert.equal(result.checks.find((check) => check.name === 'android project')?.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project doctor fails a configured native path that does not exist', async () => {
  const root = tempProject();
  try {
    writePackage(root);
    writeFileSync(join(root, 'sting.config.mjs'), `export default { ios: { project: 'ios/Missing.xcodeproj' } };\n`, 'utf8');

    const result = await collectProjectDoctorContext(root, 'ios');
    const iosProject = result.checks.find((check) => check.name === 'ios project');
    assert.equal(iosProject?.required, true);
    assert.equal(iosProject?.ok, false);
    assert.match(iosProject?.detail ?? '', /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project doctor rejects Solid 1', async () => {
  const root = tempProject();
  try {
    writePackage(root, '^1.9.0');
    const result = await collectProjectDoctorContext(root);
    const solid = result.checks.find((check) => check.name === 'solid-js 2');
    assert.equal(solid?.ok, false);
    assert.equal(solid?.required, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project doctor reports an invalid config as a required failure', async () => {
  const root = tempProject();
  try {
    writePackage(root);
    writeFileSync(join(root, 'sting.config.mjs'), 'export default { name: 42 };\n', 'utf8');

    const result = await collectProjectDoctorContext(root);
    const config = result.checks.find((check) => check.name === 'sting config');
    assert.equal(config?.required, true);
    assert.equal(config?.ok, false);
    assert.match(config?.detail ?? '', /name must be a string/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
