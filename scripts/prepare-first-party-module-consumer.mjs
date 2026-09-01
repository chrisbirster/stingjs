#!/usr/bin/env node
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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

const releasePackageRoots = [
  'packages/core',
  'packages/native',
  'packages/solid',
  'packages/stylex',
  'packages/modules-core',
  ...moduleFolders.map((folder) => `packages/modules/${folder}`),
  'tooling/cli',
];

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertPortableManifest(manifest, label) {
  for (const field of dependencyFields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec !== 'string') continue;
      if (/^(workspace:|file:|link:)/.test(spec)) {
        throw new Error(`${label} contains non-publishable ${field} entry ${name}=${spec}`);
      }
      if (spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec)) {
        throw new Error(`${label} contains absolute dependency path ${name}=${spec}`);
      }
    }
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    ...options,
  });
}

const projectRoot = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: prepare-first-party-module-consumer.mjs <project-root>');
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(projectRoot, 'package.json');
const appPackage = JSON.parse(await readFile(packagePath, 'utf8'));
appPackage.dependencies ??= {};
appPackage.devDependencies ??= {};

const packDir = await mkdtemp(join(tmpdir(), 'sting-release-packs-'));
const tarballs = [];
const packedPackages = [];

try {
  for (const relativeRoot of releasePackageRoots) {
    const source = join(repoRoot, relativeRoot);
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
    assertPortableManifest(manifest, `${manifest.name} source manifest`);

    run('npm', ['run', 'build', '--if-present'], { cwd: source });
    const raw = run(
      'npm',
      ['pack', '--pack-destination', packDir, '--json'],
      { cwd: source, capture: true },
    );
    const result = JSON.parse(raw);
    if (!Array.isArray(result) || result.length !== 1 || !result[0]?.filename) {
      throw new Error(`npm pack did not return one tarball for ${manifest.name}`);
    }

    const tarball = join(packDir, result[0].filename);
    tarballs.push(tarball);
    packedPackages.push({ name: manifest.name, version: manifest.version, relativeRoot });

    if (manifest.name === '@stingjs/cli') {
      appPackage.devDependencies[manifest.name] = manifest.version;
    } else {
      appPackage.dependencies[manifest.name] = manifest.version;
    }
  }

  assertPortableManifest(appPackage, 'generated app manifest');
  await writeFile(packagePath, `${JSON.stringify(appPackage, null, 2)}\n`, 'utf8');

  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-save',
      '--package-lock=false',
      ...tarballs,
    ],
    { cwd: projectRoot },
  );

  await rm(join(projectRoot, 'package-lock.json'), { force: true });

  for (const packed of packedPackages) {
    const installedRoot = join(projectRoot, 'node_modules', ...packed.name.split('/'));
    const installedManifestPath = join(installedRoot, 'package.json');
    if (!(await exists(installedManifestPath))) {
      throw new Error(`clean consumer is missing installed package ${packed.name}`);
    }

    const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'));
    if (installedManifest.name !== packed.name || installedManifest.version !== packed.version) {
      throw new Error(`clean consumer installed unexpected identity for ${packed.name}`);
    }
    assertPortableManifest(installedManifest, `${packed.name} packed manifest`);

    const installedRealPath = await realpath(installedRoot);
    if (installedRealPath === repoRoot || installedRealPath.startsWith(`${repoRoot}/`)) {
      throw new Error(`${packed.name} resolved back into the Sting monorepo: ${installedRealPath}`);
    }
  }

  for (const folder of moduleFolders) {
    const sourceManifest = JSON.parse(
      await readFile(join(repoRoot, 'packages', 'modules', folder, 'sting-module.json'), 'utf8'),
    );
    const installedRoot = join(projectRoot, 'node_modules', ...sourceManifest.package.split('/'));
    for (const entry of ['package.json', 'sting-module.json', 'ios', 'android']) {
      if (!(await exists(join(installedRoot, entry)))) {
        throw new Error(`${sourceManifest.package} tarball is missing ${entry}`);
      }
    }
  }

  const serializedApp = JSON.stringify(appPackage);
  if (/(workspace:|file:|link:)/.test(serializedApp) || serializedApp.includes(repoRoot)) {
    throw new Error('generated application manifest leaks workspace or monorepo paths');
  }

  run('npm', ['run', 'typecheck'], { cwd: projectRoot });
  run('npm', ['run', 'build'], { cwd: projectRoot });

  if (!(await exists(join(projectRoot, 'dist', 'sting-app.js'))) {
    throw new Error('generated application build did not produce dist/sting-app.js');
  }

  console.log(
    `Prepared and built clean Sting consumer from ${packedPackages.length} npm tarballs (${moduleFolders.length} first-party modules).`,
  );
} finally {
  await rm(packDir, { recursive: true, force: true });
}
