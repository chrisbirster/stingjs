import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'packages/modules');
const allowedCapabilities = new Set([
  'sync-functions',
  'async-functions',
  'events',
  'native-objects',
  'native-views',
  'permissions',
  'lifecycle',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requirePath(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} is missing: ${path}`);
  }
}

async function validateModule(directory) {
  const moduleRoot = join(root, directory);
  const manifestPath = join(moduleRoot, 'sting-module.json');
  const packagePath = join(moduleRoot, 'package.json');
  const [manifest, pkg] = await Promise.all([
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readFile(packagePath, 'utf8').then(JSON.parse),
  ]);

  const prefix = `${directory}/sting-module.json`;
  assert(manifest.schemaVersion === 1, `${prefix}: schemaVersion must be 1`);
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, `${prefix}: name is required`);
  assert(/^@stingjs\/[a-z0-9-]+$/.test(manifest.package), `${prefix}: package must be an @stingjs/* package`);
  assert(typeof manifest.version === 'string' && manifest.version.length > 0, `${prefix}: version is required`);
  assert(manifest.package === pkg.name, `${prefix}: package must match package.json name`);
  assert(manifest.version === pkg.version, `${prefix}: version must match package.json version`);
  assert(typeof manifest.ios?.module === 'string' && manifest.ios.module.length > 0, `${prefix}: ios.module is required`);
  assert(typeof manifest.android?.module === 'string' && manifest.android.module.length > 0, `${prefix}: android.module is required`);

  for (const capability of manifest.capabilities ?? []) {
    assert(allowedCapabilities.has(capability), `${prefix}: unknown capability ${capability}`);
  }

  for (const platform of ['ios', 'android']) {
    const permissions = manifest[platform]?.permissions ?? [];
    assert(Array.isArray(permissions), `${prefix}: ${platform}.permissions must be an array`);
    assert(new Set(permissions).size === permissions.length, `${prefix}: ${platform}.permissions contains duplicates`);
  }

  await Promise.all([
    requirePath(join(moduleRoot, 'src/index.ts'), `${manifest.package} JavaScript entrypoint`),
    requirePath(join(moduleRoot, 'Package.swift'), `${manifest.package} iOS package`),
    requirePath(join(moduleRoot, 'android/build.gradle.kts'), `${manifest.package} Android library`),
  ]);

  return manifest;
}

const entries = await readdir(root, { withFileTypes: true });
const moduleDirectories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
assert(moduleDirectories.length > 0, 'No Sting modules found');

const manifests = [];
for (const directory of moduleDirectories) manifests.push(await validateModule(directory));

const names = manifests.map(manifest => manifest.name);
const packages = manifests.map(manifest => manifest.package);
assert(new Set(names).size === names.length, 'Duplicate Sting native module name detected');
assert(new Set(packages).size === packages.length, 'Duplicate Sting module package detected');

console.log(`Validated ${manifests.length} Sting module manifest(s): ${packages.join(', ')}`);
