#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const publish = args.includes('--publish');
const trust = args.includes('--trust');
const positional = args.filter((arg) => !arg.startsWith('--') && !arg.startsWith('-'));
const versionIndex = args.indexOf('--version');
const explicitVersion = versionIndex >= 0 ? args[versionIndex + 1] : undefined;

if (help) {
  process.stdout.write(`usage: npm run release:npm:bootstrap -- [artifact-dir] --version <bootstrap-semver> [--publish] [--trust]\n\n` +
    `Without --publish/--trust, validates the release bundle only.\n` +
    `--publish publishes only a *-bootstrap.* version under the bootstrap dist-tag.\n` +
    `--trust configures GitHub Actions trusted publishing for chrisbirster/stingjs release.yml.\n` +
    `The helper intentionally refuses rc/stable versions.\n`);
  process.exit(0);
}

if (versionIndex >= 0 && (!explicitVersion || explicitVersion.startsWith('-'))) {
  throw new Error('--version requires a value');
}

const artifactDir = resolve(positional[0] ?? 'release-artifacts');
const orderPath = join(artifactDir, 'npm-publish-order.txt');
const orderText = await readFile(orderPath, 'utf8');
const tarballs = orderText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

if (tarballs.length !== 22) {
  throw new Error(`bootstrap: expected exactly 22 tarballs in npm-publish-order.txt; found ${tarballs.length}`);
}
if (new Set(tarballs).size !== tarballs.length) {
  throw new Error('bootstrap: npm-publish-order.txt contains duplicate tarballs');
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: options.inherit ? undefined : 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status})\n${stdout}${stderr}`);
  }
  return result;
}

function readTarballManifest(tarballPath) {
  const result = run('tar', ['-xOf', tarballPath, 'package/package.json']);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`bootstrap: invalid package/package.json in ${tarballPath}: ${error.message}`);
  }
}

const packages = tarballs.map((tarball) => {
  if (tarball.includes('/') || tarball.includes('\\')) {
    throw new Error(`bootstrap: publish order must contain artifact basenames only; got ${tarball}`);
  }
  const path = join(artifactDir, tarball);
  const manifest = readTarballManifest(path);
  return { tarball, path, manifest };
});

const names = packages.map(({ manifest }) => manifest.name);
if (names.some((name) => typeof name !== 'string' || name.length === 0)) {
  throw new Error('bootstrap: every tarball must contain a package name');
}
if (new Set(names).size !== 22) {
  throw new Error('bootstrap: expected 22 unique package names');
}
if (!names.includes('@stingjs/cli') || !names.includes('create-sting')) {
  throw new Error('bootstrap: package cohort is missing @stingjs/cli or create-sting');
}
for (const name of names) {
  if (name !== 'create-sting' && !name.startsWith('@stingjs/')) {
    throw new Error(`bootstrap: unexpected public package ${name}`);
  }
}

const versions = new Set(packages.map(({ manifest }) => manifest.version));
if (versions.size !== 1) {
  throw new Error(`bootstrap: tarballs do not share one exact version: ${[...versions].join(', ')}`);
}
const version = [...versions][0];
if (explicitVersion && explicitVersion !== version) {
  throw new Error(`bootstrap: release bundle version is ${version}; --version requested ${explicitVersion}`);
}
if (typeof version !== 'string' || !/-bootstrap(?:\.|$)/.test(version)) {
  throw new Error(`bootstrap: refusing to operate on non-bootstrap version ${version}; real rc/stable versions must publish through OIDC`);
}

for (const { manifest, tarball } of packages) {
  if (manifest.publishConfig?.access !== 'public') {
    throw new Error(`bootstrap: ${manifest.name} in ${tarball} must declare publishConfig.access=public`);
  }
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  if (repository !== 'git+https://github.com/chrisbirster/stingjs.git') {
    throw new Error(`bootstrap: ${manifest.name} repository is ${repository ?? '<missing>'}; expected git+https://github.com/chrisbirster/stingjs.git`);
  }
}

process.stdout.write(`bootstrap bundle verified: version=${version} packages=${packages.length} artifacts=${artifactDir}\n`);
for (const { manifest, tarball } of packages) {
  process.stdout.write(`  ${manifest.name}@${manifest.version} <- ${tarball}\n`);
}

if (!publish && !trust) {
  process.stdout.write('validation only; pass --publish and/or --trust to mutate npm registry state\n');
  process.exit(0);
}

const whoami = run('npm', ['whoami']).stdout.trim();
const registry = run('npm', ['config', 'get', 'registry']).stdout.trim();
if (registry !== 'https://registry.npmjs.org/') {
  throw new Error(`bootstrap: expected registry https://registry.npmjs.org/; got ${registry}`);
}
process.stdout.write(`npm maintainer=${whoami} registry=${registry}\n`);

function registryHasExactVersion(name, expectedVersion) {
  const result = run('npm', ['view', `${name}@${expectedVersion}`, 'version', '--json'], { allowFailure: true });
  if (result.status === 0) {
    const raw = (result.stdout ?? '').trim();
    const observed = raw ? JSON.parse(raw) : null;
    return observed === expectedVersion || (Array.isArray(observed) && observed.includes(expectedVersion));
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/E404|404 Not Found|is not in this registry/i.test(output)) return false;
  throw new Error(`bootstrap: npm view failed for ${name}@${expectedVersion}\n${output}`);
}

if (publish) {
  for (const pkg of packages) {
    const { name } = pkg.manifest;
    if (registryHasExactVersion(name, version)) {
      process.stdout.write(`already published; skipping ${name}@${version}\n`);
      continue;
    }
    process.stdout.write(`publishing bootstrap ${name}@${version} under dist-tag bootstrap\n`);
    run('npm', ['publish', pkg.path, '--access', 'public', '--tag', 'bootstrap'], { inherit: true });
    if (!registryHasExactVersion(name, version)) {
      throw new Error(`bootstrap: registry did not report ${name}@${version} after publish`);
    }
  }
}

if (trust) {
  const missing = packages.filter(({ manifest }) => !registryHasExactVersion(manifest.name, version));
  if (missing.length > 0) {
    throw new Error(`bootstrap: cannot configure trust before bootstrap publication exists for: ${missing.map(({ manifest }) => manifest.name).join(', ')}`);
  }

  for (let index = 0; index < packages.length; index += 1) {
    const name = packages[index].manifest.name;
    process.stdout.write(`configuring trusted publisher for ${name}\n`);
    run('npm', [
      'trust', 'github', name,
      '--repo', 'chrisbirster/stingjs',
      '--file', 'release.yml',
      '--allow-publish',
      '--yes',
    ], { inherit: true });

    run('npm', ['trust', 'list', name], { inherit: true });
    if (index + 1 < packages.length) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    }
  }
}

process.stdout.write(`bootstrap operation complete: version=${version} publish=${publish} trust=${trust}\n`);
