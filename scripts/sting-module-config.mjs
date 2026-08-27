import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ANDROID_PERMISSION_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
export const IOS_USAGE_DESCRIPTION_PATTERN = /^NS[A-Za-z0-9]+UsageDescription$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertStringArray(values, label, pattern) {
  assert(Array.isArray(values), `${label} must be an array`);
  const seen = new Set();
  for (const value of values) {
    assert(typeof value === 'string' && value.length > 0, `${label} must contain non-empty strings`);
    assert(pattern.test(value), `${label} contains invalid permission identifier ${JSON.stringify(value)}`);
    assert(!seen.has(value), `${label} contains duplicate permission ${value}`);
    seen.add(value);
  }
}

export function validatePlatformPermissions(manifest, source = manifest.package ?? manifest.name ?? '<module>') {
  assertStringArray(
    manifest.ios?.permissions ?? [],
    `${source}: ios.permissions`,
    IOS_USAGE_DESCRIPTION_PATTERN,
  );
  assertStringArray(
    manifest.android?.permissions ?? [],
    `${source}: android.permissions`,
    ANDROID_PERMISSION_PATTERN,
  );
}

function sameConfiguration(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalModuleEntry(manifest) {
  return {
    package: manifest.package,
    version: manifest.version,
    iosPermissions: [...(manifest.ios?.permissions ?? [])].sort(),
    androidPermissions: [...(manifest.android?.permissions ?? [])].sort(),
  };
}

export function aggregateModuleConfiguration(manifests) {
  const byPackage = new Map();

  for (const manifest of manifests) {
    validatePlatformPermissions(manifest);
    assert(typeof manifest.package === 'string' && manifest.package.length > 0, 'module package is required');
    assert(typeof manifest.version === 'string' && manifest.version.length > 0, `${manifest.package}: version is required`);

    const entry = canonicalModuleEntry(manifest);
    const existing = byPackage.get(entry.package);
    if (existing) {
      assert(
        sameConfiguration(existing, entry),
        `Conflicting Sting module configuration for ${entry.package}: multiple versions or permission declarations were discovered`,
      );
      continue;
    }
    byPackage.set(entry.package, entry);
  }

  const modules = [...byPackage.values()].sort((left, right) => left.package.localeCompare(right.package));
  const androidPermissions = [...new Set(modules.flatMap(module => module.androidPermissions))].sort();
  const iosRequiredInfoPlistKeys = [...new Set(modules.flatMap(module => module.iosPermissions))].sort();

  return {
    schemaVersion: 1,
    modules: modules.map(({ package: packageName, version }) => ({ package: packageName, version })),
    android: {
      permissions: androidPermissions,
    },
    ios: {
      requiredInfoPlistKeys: iosRequiredInfoPlistKeys,
    },
  };
}

function escapeXmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderAndroidPermissionsManifest(plan) {
  const permissions = plan.android?.permissions ?? [];
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
  ];
  for (const permission of permissions) {
    lines.push(`  <uses-permission android:name="${escapeXmlAttribute(permission)}" />`);
  }
  lines.push('</manifest>', '');
  return lines.join('\n');
}

export function renderIOSPermissionRequirements(plan) {
  return `${JSON.stringify({
    schemaVersion: 1,
    requiredInfoPlistKeys: plan.ios?.requiredInfoPlistKeys ?? [],
  }, null, 2)}\n`;
}

export function renderConfigurationPlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export async function discoverRepositoryModuleManifests(root = process.cwd()) {
  const modulesRoot = resolve(root, 'packages/modules');
  const entries = await readdir(modulesRoot, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const manifests = [];
  for (const directory of directories) {
    const path = join(modulesRoot, directory, 'sting-module.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifests.push(manifest);
  }
  return manifests;
}

export async function writeGeneratedModuleConfiguration(outputDirectory, plan) {
  const files = [
    [join(outputDirectory, 'sting-modules.config.json'), renderConfigurationPlan(plan)],
    [join(outputDirectory, 'android', 'AndroidManifest.permissions.xml'), renderAndroidPermissionsManifest(plan)],
    [join(outputDirectory, 'ios', 'InfoPlist.permissions.json'), renderIOSPermissionRequirements(plan)],
  ];

  for (const [path, content] of files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
  return files.map(([path]) => path);
}

async function main() {
  const outputFlag = process.argv.indexOf('--output');
  const outputDirectory = outputFlag === -1
    ? resolve(process.cwd(), 'generated/sting-modules')
    : resolve(process.cwd(), process.argv[outputFlag + 1] ?? '');
  if (outputFlag !== -1 && !process.argv[outputFlag + 1]) {
    throw new Error('--output requires a directory');
  }

  const manifests = await discoverRepositoryModuleManifests();
  const plan = aggregateModuleConfiguration(manifests);
  const files = await writeGeneratedModuleConfiguration(outputDirectory, plan);
  console.log(`Generated Sting module configuration for ${plan.modules.length} module(s):`);
  for (const path of files) console.log(`- ${path}`);
}

const invokedAsScript = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (invokedAsScript) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
