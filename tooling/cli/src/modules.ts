import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { synchronizeModuleHostConfiguration } from './module-host-config.js';

export type AndroidModuleFactory = 'default' | 'context';
export type IOSModuleFactory = 'default';

export interface StingModuleManifest {
  schemaVersion: 1;
  name: string;
  package: string;
  version: string;
  ios: {
    module: string;
    factory?: IOSModuleFactory;
    permissions?: string[];
  };
  android: {
    module: string;
    factory?: AndroidModuleFactory;
    permissions?: string[];
  };
  capabilities?: string[];
}

export interface DiscoveredStingModule {
  root: string;
  manifest: StingModuleManifest;
}

export interface StingModulePlanEntry {
  name: string;
  package: string;
  version: string;
  ios: { module: string; factory: IOSModuleFactory };
  android: { module: string; factory: AndroidModuleFactory };
}

export interface StingModulePlan {
  schemaVersion: 1;
  modules: StingModulePlanEntry[];
  android: { permissions: string[] };
  ios: { requiredInfoPlistKeys: string[] };
}

const ANDROID_PERMISSION_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const IOS_USAGE_DESCRIPTION_PATTERN = /^NS[A-Za-z0-9]+UsageDescription$/;
const SWIFT_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KOTLIN_QUALIFIED_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function validateStringArray(values: unknown, label: string, pattern: RegExp): string[] {
  assert(Array.isArray(values), `${label} must be an array`);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    assert(typeof value === 'string' && value.length > 0, `${label} must contain non-empty strings`);
    assert(pattern.test(value), `${label} contains invalid identifier ${JSON.stringify(value)}`);
    assert(!seen.has(value), `${label} contains duplicate value ${value}`);
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function validateModuleManifest(value: unknown, source = '<module>'): StingModuleManifest {
  assert(typeof value === 'object' && value !== null, `${source}: manifest must be an object`);
  const manifest = value as Partial<StingModuleManifest>;
  assert(manifest.schemaVersion === 1, `${source}: schemaVersion must be 1`);
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, `${source}: name is required`);
  assert(typeof manifest.package === 'string' && manifest.package.length > 0, `${source}: package is required`);
  assert(typeof manifest.version === 'string' && manifest.version.length > 0, `${source}: version is required`);
  assert(typeof manifest.ios?.module === 'string' && SWIFT_IDENTIFIER.test(manifest.ios.module), `${source}: ios.module must be a Swift type identifier`);
  assert(typeof manifest.android?.module === 'string' && KOTLIN_QUALIFIED_NAME.test(manifest.android.module), `${source}: android.module must be a qualified Kotlin type`);

  const iosFactory = manifest.ios.factory ?? 'default';
  const androidFactory = manifest.android.factory ?? 'default';
  assert(iosFactory === 'default', `${source}: ios.factory must be "default"`);
  assert(androidFactory === 'default' || androidFactory === 'context', `${source}: android.factory must be "default" or "context"`);
  validateStringArray(manifest.ios.permissions ?? [], `${source}: ios.permissions`, IOS_USAGE_DESCRIPTION_PATTERN);
  validateStringArray(manifest.android.permissions ?? [], `${source}: android.permissions`, ANDROID_PERMISSION_PATTERN);
  return manifest as StingModuleManifest;
}

function canonicalEntry(manifest: StingModuleManifest): StingModulePlanEntry {
  return {
    name: manifest.name,
    package: manifest.package,
    version: manifest.version,
    ios: { module: manifest.ios.module, factory: manifest.ios.factory ?? 'default' },
    android: { module: manifest.android.module, factory: manifest.android.factory ?? 'default' },
  };
}

export function createModulePlan(records: readonly DiscoveredStingModule[]): StingModulePlan {
  const byPackage = new Map<string, StingModulePlanEntry>();
  const nativeNames = new Map<string, string>();
  const iosTypes = new Map<string, string>();
  const androidTypes = new Map<string, string>();
  const androidPermissions = new Set<string>();
  const iosPermissions = new Set<string>();

  for (const record of records) {
    const manifest = validateModuleManifest(record.manifest, `${record.manifest.package || record.root}/sting-module.json`);
    const entry = canonicalEntry(manifest);
    const existing = byPackage.get(entry.package);
    if (existing) {
      assert(JSON.stringify(existing) === JSON.stringify(entry), `Conflicting Sting module package ${entry.package} was discovered`);
      continue;
    }
    const existingName = nativeNames.get(entry.name);
    assert(!existingName, `Duplicate Sting native module name ${entry.name} from ${existingName} and ${entry.package}`);
    const existingIos = iosTypes.get(entry.ios.module);
    assert(!existingIos, `Duplicate Sting iOS module type ${entry.ios.module} from ${existingIos} and ${entry.package}`);
    const existingAndroid = androidTypes.get(entry.android.module);
    assert(!existingAndroid, `Duplicate Sting Android module type ${entry.android.module} from ${existingAndroid} and ${entry.package}`);

    byPackage.set(entry.package, entry);
    nativeNames.set(entry.name, entry.package);
    iosTypes.set(entry.ios.module, entry.package);
    androidTypes.set(entry.android.module, entry.package);
    for (const permission of manifest.android.permissions ?? []) androidPermissions.add(permission);
    for (const permission of manifest.ios.permissions ?? []) iosPermissions.add(permission);
  }

  return {
    schemaVersion: 1,
    modules: [...byPackage.values()].sort((left, right) => left.package.localeCompare(right.package)),
    android: { permissions: [...androidPermissions].sort() },
    ios: { requiredInfoPlistKeys: [...iosPermissions].sort() },
  };
}

function dependencyNames(pkg: Record<string, unknown>, includeDev: boolean): string[] {
  const sections = ['dependencies', 'optionalDependencies', ...(includeDev ? ['devDependencies'] : [])];
  const names = new Set<string>();
  for (const section of sections) {
    const dependencies = pkg[section];
    if (!dependencies || typeof dependencies !== 'object') continue;
    for (const name of Object.keys(dependencies)) names.add(name);
  }
  return [...names].sort();
}

async function resolveInstalledPackage(name: string, parentRoot: string, projectRoot: string): Promise<string | undefined> {
  const candidates = [join(parentRoot, 'node_modules', name), join(projectRoot, 'node_modules', name)];
  for (const candidate of candidates) {
    if (await exists(join(candidate, 'package.json'))) return candidate;
  }
  return undefined;
}

export async function discoverInstalledStingModules(projectRoot = process.cwd()): Promise<DiscoveredStingModule[]> {
  const root = resolve(projectRoot);
  const appPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
  const queue = dependencyNames(appPackage, true).map(name => ({ name, parentRoot: root }));
  const visited = new Set<string>();
  const records: DiscoveredStingModule[] = [];

  while (queue.length > 0) {
    const next = queue.shift()!;
    const packageRoot = await resolveInstalledPackage(next.name, next.parentRoot, root);
    if (!packageRoot || visited.has(packageRoot)) continue;
    visited.add(packageRoot);

    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    const manifestPath = join(packageRoot, 'sting-module.json');
    if (await exists(manifestPath)) {
      const manifest = validateModuleManifest(JSON.parse(await readFile(manifestPath, 'utf8')), manifestPath);
      records.push({ root: packageRoot, manifest });
    }

    for (const name of dependencyNames(pkg, false)) queue.push({ name, parentRoot: packageRoot });
  }

  records.sort((left, right) => left.manifest.package.localeCompare(right.manifest.package));
  createModulePlan(records); // conflict validation
  return records;
}

function kotlinAlias(index: number): string {
  return `StingAutolinkModule${index}`;
}

export function renderAndroidRegistry(plan: StingModulePlan): string {
  const imports = plan.modules.map((module, index) => `import ${module.android.module} as ${kotlinAlias(index)}`);
  const factories = plan.modules.map((module, index) => {
    const expression = module.android.factory === 'context'
      ? `${kotlinAlias(index)}(context)`
      : `${kotlinAlias(index)}()`;
    return `        ${expression},`;
  });
  return [
    'package run.stingjs.generated',
    '',
    'import android.content.Context',
    'import run.stingjs.runtime.StingNativeModule',
    ...imports,
    '',
    'fun createStingModules(context: Context): List<StingNativeModule> = listOf(',
    ...factories,
    ')',
    '',
  ].join('\n');
}

export function renderIOSRegistry(plan: StingModulePlan): string {
  const factories = plan.modules.map(module => `        ${module.ios.module}(),`);
  return [
    'import StingRuntime',
    '',
    'public func createStingModules() -> [any StingNativeModule] {',
    '    [',
    ...factories,
    '    ]',
    '}',
    '',
  ].join('\n');
}

export function renderIOSGeneratedPackage(): string {
  return `// swift-tools-version: 5.10\n\nimport PackageDescription\n\nlet package = Package(\n    name: "StingGeneratedModules",\n    platforms: [.iOS(.v16)],\n    products: [.library(name: "StingGeneratedModules", targets: ["StingGeneratedModules"])],\n    dependencies: [.package(path: "../../../ios/StingQuickJSRuntime")],\n    targets: [\n        .target(\n            name: "StingGeneratedModules",\n            dependencies: [.product(name: "StingRuntime", package: "StingQuickJSRuntime")],\n            path: "Sources/StingGeneratedModules"\n        )\n    ],\n    swiftLanguageVersions: [.v5]\n)\n`;
}

function renderAndroidPermissions(plan: StingModulePlan): string {
  return `${JSON.stringify({ schemaVersion: 1, permissions: plan.android.permissions }, null, 2)}\n`;
}

function renderIOSPermissions(plan: StingModulePlan): string {
  return `${JSON.stringify({ schemaVersion: 1, requiredInfoPlistKeys: plan.ios.requiredInfoPlistKeys }, null, 2)}\n`;
}

async function copyModuleSources(record: DiscoveredStingModule, generatedRoot: string): Promise<void> {
  const androidSource = join(record.root, 'android', 'src', 'main', 'java');
  if (await exists(androidSource)) {
    await cp(androidSource, join(generatedRoot, 'android', 'src', 'main', 'java'), { recursive: true, force: true });
  }

  const iosSource = join(record.root, 'ios');
  if (await exists(iosSource)) {
    const packageDirectory = record.manifest.package.replace(/^@/, '').replaceAll('/', '__').replaceAll('-', '_');
    await cp(
      iosSource,
      join(generatedRoot, 'ios', 'Sources', 'StingGeneratedModules', packageDirectory),
      { recursive: true, force: true },
    );
  }
}

export async function synchronizeModuleAutolinking(projectRoot = process.cwd()): Promise<StingModulePlan> {
  const root = resolve(projectRoot);
  const records = await discoverInstalledStingModules(root);
  const plan = createModulePlan(records);
  const generatedRoot = join(root, '.sting', 'generated');

  await rm(join(generatedRoot, 'android'), { recursive: true, force: true });
  await rm(join(generatedRoot, 'ios'), { recursive: true, force: true });
  await mkdir(join(generatedRoot, 'android', 'src', 'main', 'java', 'run', 'stingjs', 'generated'), { recursive: true });
  await mkdir(join(generatedRoot, 'ios', 'Sources', 'StingGeneratedModules'), { recursive: true });

  for (const record of records) await copyModuleSources(record, generatedRoot);

  await writeFile(
    join(generatedRoot, 'android', 'src', 'main', 'java', 'run', 'stingjs', 'generated', 'StingGeneratedModules.kt'),
    renderAndroidRegistry(plan),
    'utf8',
  );
  await writeFile(join(generatedRoot, 'ios', 'Sources', 'StingGeneratedModules', 'Registry.swift'), renderIOSRegistry(plan), 'utf8');
  await writeFile(join(generatedRoot, 'ios', 'Package.swift'), renderIOSGeneratedPackage(), 'utf8');
  await writeFile(join(generatedRoot, 'sting-modules.config.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  await writeFile(join(generatedRoot, 'android', 'permissions.json'), renderAndroidPermissions(plan), 'utf8');
  await writeFile(join(generatedRoot, 'ios', 'permissions.json'), renderIOSPermissions(plan), 'utf8');
  await synchronizeModuleHostConfiguration(root, records, plan, generatedRoot);

  return plan;
}

export function describeModulePlan(plan: StingModulePlan, projectRoot: string): string {
  const modules = plan.modules.length === 0 ? 'none' : plan.modules.map(module => module.package).join(', ');
  return `Autolinked ${plan.modules.length} Sting module(s) in ${relative(process.cwd(), resolve(projectRoot)) || '.'}: ${modules}`;
}
