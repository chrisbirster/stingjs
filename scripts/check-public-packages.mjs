#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const moduleFolders = [
  'haptics',
  'clipboard',
  'device',
  'filesystem',
  'secure-store',
  'network',
  'sharing',
  'sensors',
  'image-picker',
  'location',
  'contacts',
  'camera',
  'notifications',
  'audio',
  'background-task',
];

const packageRoots = [
  'packages/core',
  'packages/native',
  'packages/solid',
  'packages/stylex',
  'packages/modules-core',
  ...moduleFolders.map((folder) => `packages/modules/${folder}`),
  'tooling/cli',
  'tooling/create-sting',
];

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function fail(message) {
  throw new Error(`public package check: ${message}`);
}

async function readManifest(relativeRoot) {
  const path = join(root, relativeRoot, 'package.json');
  return JSON.parse(await readFile(path, 'utf8'));
}

const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const releaseVersion = rootManifest.version;
const manifests = new Map();

for (const relativeRoot of packageRoots) {
  const manifest = await readManifest(relativeRoot);
  if (!manifest.name) fail(`${relativeRoot}/package.json is missing name`);
  manifests.set(manifest.name, { relativeRoot, manifest });
}

for (const [name, { relativeRoot, manifest }] of manifests) {
  if (manifest.private === true) {
    fail(`${name} is still private`);
  }
  if (manifest.version !== releaseVersion) {
    fail(`${name} version ${manifest.version} does not match root version ${releaseVersion}`);
  }
  if (manifest.publishConfig?.access !== 'public') {
    fail(`${name} must declare publishConfig.access=public`);
  }
  if (manifest.license !== 'MIT') {
    fail(`${name} must declare license=MIT`);
  }

  for (const field of dependencyFields) {
    for (const [dependencyName, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec !== 'string') continue;
      if (/^(workspace:|file:|link:)/.test(spec)) {
        fail(`${name} contains non-publishable ${field} entry ${dependencyName}=${spec}`);
      }
      if (isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)) {
        fail(`${name} contains absolute dependency path ${dependencyName}=${spec}`);
      }
      if (manifests.has(dependencyName) && spec !== releaseVersion) {
        fail(`${name} pins Sting dependency ${dependencyName}=${spec}; expected ${releaseVersion}`);
      }
    }
  }

  if (name !== 'create-sting' && !name.startsWith('@stingjs/')) {
    fail(`${relativeRoot} has unexpected public package name ${name}`);
  }
}

if (!manifests.has('@stingjs/cli')) fail('missing @stingjs/cli');
if (!manifests.has('create-sting')) fail('missing create-sting');

process.stdout.write(
  `public package check passed: version=${releaseVersion} packages=${manifests.size}\n`,
);
