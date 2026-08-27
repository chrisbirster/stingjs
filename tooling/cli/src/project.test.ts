import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectProjectChecks, supportsSolid2 } from './project.js';

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'sting-project-'));
}

function writePackage(root: string, solid = '2.0.0-rc.1'): void {
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { build: 'vite build' },
    dependencies: {
      '@stingjs/solid': '0.1.0',
      'solid-js': solid,
    },
  }));
}

test('supportsSolid2 accepts common Solid 2 declarations', () => {
  assert.equal(supportsSolid2('2.0.0-rc.1'), true);
  assert.equal(supportsSolid2('^2.0.0'), true);
  assert.equal(supportsSolid2('>=2.0.0-rc.1 <3'), true);
  assert.equal(supportsSolid2('workspace:*'), true);
  assert.equal(supportsSolid2('^1.9.0'), false);
  assert.equal(supportsSolid2('^3.0.0'), false);
});

test('collectProjectChecks validates the expected Sting app packages', async () => {
  const root = fixture();
  try {
    writePackage(root);
    const checks = await collectProjectChecks(root);
    assert.equal(checks.find((check) => check.name === 'sting project')?.ok, true);
    assert.equal(checks.find((check) => check.name === '@stingjs/solid')?.ok, true);
    assert.equal(checks.find((check) => check.name === 'solid-js 2')?.ok, true);
    assert.equal(checks.find((check) => check.name === 'build script')?.ok, true);
    assert.equal(checks.find((check) => check.name === 'sting config')?.skipped, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectProjectChecks rejects Solid 1', async () => {
  const root = fixture();
  try {
    writePackage(root, '^1.9.0');
    const checks = await collectProjectChecks(root);
    const solid = checks.find((check) => check.name === 'solid-js 2');
    assert.equal(solid?.ok, false);
    assert.equal(solid?.required, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectProjectChecks validates configured native project paths', async () => {
  const root = fixture();
  try {
    writePackage(root);
    mkdirSync(join(root, 'native-ios'));
    writeFileSync(join(root, 'sting.config.ts'), `export default { ios: { project: 'native-ios' } };`);
    const checks = await collectProjectChecks(root, 'ios');
    assert.equal(checks.find((check) => check.name === 'sting config')?.ok, true);
    assert.equal(checks.find((check) => check.name === 'ios project')?.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectProjectChecks fails clearly outside a Sting project', async () => {
  const root = fixture();
  try {
    const checks = await collectProjectChecks(root);
    assert.deepEqual(checks.map((check) => [check.name, check.ok, check.required]), [
      ['sting project', false, true],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
