#!/usr/bin/env node
import { access, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const moduleFolders = [
  'haptics', 'clipboard', 'device', 'filesystem', 'secure-store', 'network',
  'sharing', 'sensors', 'image-picker', 'location', 'contacts', 'camera',
  'notifications', 'audio', 'background-task',
];
const publicPackageRoots = [
  'packages/core', 'packages/native', 'packages/solid', 'packages/stylex',
  'packages/modules-core',
  ...moduleFolders.map((folder) => `packages/modules/${folder}`),
  'tooling/cli', 'tooling/create-sting',
];
const publicManifestPaths = publicPackageRoots.map((packageRoot) => `${packageRoot}/package.json`);
const moduleDescriptorPaths = moduleFolders.map((folder) => `packages/modules/${folder}/sting-module.json`);
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

async function expandWorkspaceManifestPaths(workspaces) {
  if (!Array.isArray(workspaces)) {
    throw new Error('release version: root workspaces must be an array');
  }

  const paths = [];
  for (const workspace of workspaces) {
    if (typeof workspace !== 'string' || workspace.length === 0) {
      throw new Error(`release version: unsupported workspace entry ${String(workspace)}`);
    }

    if (!workspace.includes('*')) {
      paths.push(`${workspace}/package.json`);
      continue;
    }

    if (!workspace.endsWith('/*') || workspace.slice(0, -2).includes('*')) {
      throw new Error(`release version: unsupported workspace glob ${workspace}`);
    }

    const parent = workspace.slice(0, -2);
    const entries = await readdir(join(root, parent), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) paths.push(`${parent}/${entry.name}/package.json`);
    }
  }

  return [...new Set(paths)].sort();
}

const rootRecord = await loadJsonRecord('package.json');
const publicRecords = [];
const publicNames = new Set();
for (const relativePath of publicManifestPaths) {
  const record = await loadJsonRecord(relativePath);
  publicRecords.push(record);
  publicNames.add(record.manifest.name);
}
const moduleDescriptorRecords = [];
for (const relativePath of moduleDescriptorPaths) {
  moduleDescriptorRecords.push(await loadJsonRecord(relativePath));
}
const templateRecord = await loadJsonRecord(templateManifestPath);

if (publicNames.size !== 22) {
  throw new Error(`release version: expected 22 public packages, found ${publicNames.size}`);
}
if (!publicNames.has('@stingjs/cli') || !publicNames.has('create-sting')) {
  throw new Error('release version: public package set is incomplete');
}
if (moduleDescriptorRecords.length !== moduleFolders.length) {
  throw new Error(
    `release version: expected ${moduleFolders.length} module descriptors, found ${moduleDescriptorRecords.length}`,
  );
}

const publicManifestPathSet = new Set(publicManifestPaths);
const publicRecordByPath = new Map(publicRecords.map((record) => [record.relativePath, record]));
const workspaceManifestPaths = await expandWorkspaceManifestPaths(currentRootManifest.workspaces);
const consumerManifestPaths = workspaceManifestPaths.filter(
  (relativePath) => !publicManifestPathSet.has(relativePath),
);
const consumerRecords = [];
for (const relativePath of consumerManifestPaths) {
  consumerRecords.push(await loadJsonRecord(relativePath));
}

function validateDependencySpecs(record, expectedVersion, { requirePublishable = false } = {}) {
  for (const field of dependencyFields) {
    for (const [dependencyName, spec] of Object.entries(record.manifest[field] ?? {})) {
      if (typeof spec !== 'string') continue;
      if (requirePublishable && /^(workspace:|file:|link:)/.test(spec)) {
        throw new Error(`${record.relativePath}: non-publishable ${dependencyName}=${spec}`);
      }
      if (publicNames.has(dependencyName) && spec !== expectedVersion) {
        throw new Error(`${record.relativePath}: ${dependencyName} must equal ${expectedVersion}; got ${spec}`);
      }
    }
  }
}

function validateModuleDescriptors(expectedVersion) {
  for (let index = 0; index < moduleFolders.length; index += 1) {
    const folder = moduleFolders[index];
    const descriptor = moduleDescriptorRecords[index];
    const packagePath = `packages/modules/${folder}/package.json`;
    const packageRecord = publicRecordByPath.get(packagePath);
    if (!packageRecord) {
      throw new Error(`${descriptor.relativePath}: missing public package record ${packagePath}`);
    }
    if (descriptor.manifest.package !== packageRecord.manifest.name) {
      throw new Error(
        `${descriptor.relativePath}: package ${descriptor.manifest.package} does not match ${packageRecord.manifest.name}`,
      );
    }
    if (descriptor.manifest.version !== expectedVersion) {
      throw new Error(
        `${descriptor.relativePath}: version ${descriptor.manifest.version} does not equal ${expectedVersion}`,
      );
    }
  }
}

function validatePackageRecords(expectedVersion) {
  if (rootRecord.manifest.version !== expectedVersion) {
    throw new Error(`${rootRecord.relativePath}: version ${rootRecord.manifest.version} does not equal ${expectedVersion}`);
  }
  validateDependencySpecs(rootRecord, expectedVersion);

  for (const record of publicRecords) {
    if (record.manifest.version !== expectedVersion) {
      throw new Error(`${record.relativePath}: version ${record.manifest.version} does not equal ${expectedVersion}`);
    }
    validateDependencySpecs(record, expectedVersion, { requirePublishable: true });
  }

  for (const record of consumerRecords) {
    validateDependencySpecs(record, expectedVersion);
  }
  validateDependencySpecs(templateRecord, expectedVersion, { requirePublishable: true });
  validateModuleDescriptors(expectedVersion);
}

function updatePublicDependencySpecs(record, expectedVersion) {
  for (const field of dependencyFields) {
    for (const dependencyName of Object.keys(record.manifest[field] ?? {})) {
      if (publicNames.has(dependencyName)) record.manifest[field][dependencyName] = expectedVersion;
    }
  }
}

if (checkOnly) {
  validatePackageRecords(target);
  process.stdout.write(
    `release version check passed: target=${target} packages=${publicNames.size} consumers=${consumerRecords.length} modules=${moduleDescriptorRecords.length} template=1\n`,
  );
  process.exit(0);
}

rootRecord.manifest.version = target;
updatePublicDependencySpecs(rootRecord, target);

for (const record of publicRecords) {
  record.manifest.version = target;
  updatePublicDependencySpecs(record, target);
}
for (const record of consumerRecords) updatePublicDependencySpecs(record, target);
for (const record of moduleDescriptorRecords) record.manifest.version = target;
updatePublicDependencySpecs(templateRecord, target);

validatePackageRecords(target);

const transaction = [
  rootRecord,
  ...publicRecords,
  ...consumerRecords,
  ...moduleDescriptorRecords,
  templateRecord,
].map((record) => ({
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

  const moduleCheck = spawnSync(process.execPath, [join(root, 'scripts/validate-sting-modules.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  if (moduleCheck.status !== 0) {
    throw new Error(`post-write module descriptor invariant failed:\n${moduleCheck.stdout}${moduleCheck.stderr}`);
  }

  const versionCheck = spawnSync(process.execPath, [join(root, 'scripts/release-version.mjs'), target, '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (versionCheck.status !== 0) {
    throw new Error(`post-write release cohort invariant failed:\n${versionCheck.stdout}${versionCheck.stderr}`);
  }

  for (const record of transaction) await rm(record.backup, { force: true });
  process.stdout.write(
    `release version updated atomically: ${target} packages=${publicNames.size} consumers=${consumerRecords.length} modules=${moduleDescriptorRecords.length} template=1\n`,
  );
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
