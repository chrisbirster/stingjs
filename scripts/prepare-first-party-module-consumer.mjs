#!/usr/bin/env node
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

for (const folder of moduleFolders) {
  const source = join(repoRoot, 'packages', 'modules', folder);
  const manifest = JSON.parse(await readFile(join(source, 'sting-module.json'), 'utf8'));
  const packageName = manifest.package;
  appPackage.dependencies[packageName] = manifest.version;

  const destination = join(projectRoot, 'node_modules', ...packageName.split('/'));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  for (const entry of ['package.json', 'sting-module.json', 'ios', 'android']) {
    const sourceEntry = join(source, entry);
    if (!(await exists(sourceEntry))) continue;
    await cp(sourceEntry, join(destination, entry), { recursive: true, force: true });
  }
}

await writeFile(packagePath, `${JSON.stringify(appPackage, null, 2)}\n`, 'utf8');
console.log(`Prepared standalone Sting consumer with ${moduleFolders.length} first-party modules.`);
