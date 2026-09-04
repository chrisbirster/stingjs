#!/usr/bin/env node
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const moduleFolders = [
  'haptics', 'clipboard', 'device', 'filesystem', 'secure-store', 'network',
  'sharing', 'sensors', 'image-picker', 'location', 'contacts', 'camera',
  'notifications', 'audio', 'background-task',
];
const packageRoots = [
  'packages/core', 'packages/native', 'packages/solid', 'packages/stylex',
  'packages/modules-core',
  ...moduleFolders.map((folder) => `packages/modules/${folder}`),
  'tooling/cli', 'tooling/create-sting',
];
const manifestPaths = ['package.json', ...packageRoots.map((packageRoot) => `${packageRoot}/package.json`)];
const templateManifestPath = 'tooling/create-sting/template/package.json.tpl';
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const explicitTarget = args.find((arg) => !arg.startsWith('--'));
const currentRootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const target = explicitTarget ?? (checkOnly ? currentRootManifest.version : undefined);

if (!target || !semverPattern.test(target)) {
  console.error('usage: npm run release:version -- <semver> [--check]');
  process.exit(2);
}

async function loadJsonRecord(relativePath) {
  const absolutePath = join(root, relativePath);
  const original = await readFile(absolutePath, 'utf8');
  return { relativePath, absolutePath, original, manifest: JSON.parse(original) };
}

const records = [];
const publicNames = new Set();
for (const relativePath of manifestPaths) {
  const record = await loadJsonRecord(relativePath);
  records.push(record);
  if (relativePath !== 'package.json') publicNames.add(record.manifest.name);
}
const templateRecord = await loadJsonRecord(templateManifestPath);

if (publicNames.size !== 22) {
  throw new Error(`release version: expected 22 public packages, found ${publicNames.size}`);
}
if (!publicNames.has('@stingjs/cli') || !publicNames.has('create-sting')) {
  throw new Error('release version: public package set is incomplete');
}

function validateDependencySpecs(record, expectedVersion) {
  for (const field of dependencyFields) {
    for (const [dependencyName, spec] of Object.entries(record.manifest[field] ?? {})) {
      if (typeof spec !== 'string') continue;
      if (/^(workspace:|file:|link:)/.test(spec)) {
        throw new Error(`${record.relativePath}: non-publishable ${dependencyName}=${spec}`);
      }
      if (publicNames.has(dependencyName) && spec !== expectedVersion) {
        throw new Error(`${record.relativePath}: ${dependencyName} must equal ${expectedVersion}; got ${spec}`);
      }
    }
  }
}

function validatePackageRecords(expectedVersion) {
  for (const record of records) {
    if (record.manifest.version !== expectedVersion) {
      throw new Error(`${record.relativePath}: version ${record.manifest.version} does not equal ${expectedVersion}`);
    }
    if (record.relativePath !== 'package.json') validateDependencySpecs(record, expectedVersion);
  }
  validateDependencySpecs(templateRecord, expectedVersion);
}

if (checkOnly) {
  validatePackageRecords(target);
  process.stdout.write(`release version check passed: target=${target} packages=${publicNames.size} template=1\n`);
  process.exit(0);
}

for (const record of records) {
  record.manifest.version = target;
  if (record.relativePath === 'package.json') continue;
  for (const field of dependencyFields) {
    for (const dependencyName of Object.keys(record.manifest[field] ?? {})) {
      if (publicNames.has(dependencyName)) record.manifest[field][dependencyName] = target;
    }
  }
}
for (const field of dependencyFields) {
  for (const dependencyName of Object.keys(templateRecord.manifest[field] ?? {})) {
    if (publicNames.has(dependencyName)) templateRecord.manifest[field][dependencyName] = target;
  }
}

validatePackageRecords(target);

const transaction = [...records, templateRecord].map((record) => ({
  ...record,
  next: `${JSON.stringify(record.manifest, null, 2)}\n`,
  temp: `${record.absolutePath}.release-version-${process.pid}.tmp`,
  backup: `${record.absolutePath}.release-version-${process.pid}.bak`,
  replaced: false,
}));

try {
  for (const record of transaction) await writeFile(record.temp, record.next, 'utf8');

  for (const record of transaction) {
    await rename(record.absolutePath, record.backup);
    try {
      await rename(record.temp, record.absolutePath);
      record.replaced = true;
    } catch (error) {
      await rename(record.backup, record.absolutePath);
      throw error;
    }
  }

  const publicCheck = spawnSync(process.execPath, [join(root, 'scripts/check-public-packages.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (publicCheck.status !== 0) {
    throw new Error(`post-write public package invariant failed:\n${publicCheck.stdout}${publicCheck.stderr}`);
  }

  const versionCheck = spawnSync(process.execPath, [join(root, 'scripts/release-version.mjs'), target, '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (versionCheck.status !== 0) {
    throw new Error(`post-write release cohort invariant failed:\n${versionCheck.stdout}${versionCheck.stderr}`);
  }

  for (const record of transaction) await rm(record.backup, { force: true });
  process.stdout.write(`release version updated atomically: ${target} packages=${publicNames.size} template=1\n`);
} catch (error) {
  for (const record of [...transaction].reverse()) {
    try {
      await access(record.backup);
      if (record.replaced) await rm(record.absolutePath, { force: true });
      await rename(record.backup, record.absolutePath);
    } catch {
      // A missing backup means this record had not yet been replaced.
    }
    await rm(record.temp, { force: true });
  }
  throw error;
} finally {
  for (const record of transaction) {
    await rm(record.temp, { force: true });
    // Backups are retained only if restoration itself failed, which is safer
    // than deleting the last known-good copy.
  }
}
