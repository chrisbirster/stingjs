import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findStingConfig, loadStingConfig } from './config.js';
import type { DevicePlatform, DoctorCheck } from './platform.js';

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function declaredVersion(packageJson: PackageJson, name: string): string | undefined {
  return packageJson.dependencies?.[name]
    ?? packageJson.devDependencies?.[name]
    ?? packageJson.peerDependencies?.[name];
}

export function supportsSolid2(versionSpec: string): boolean {
  const spec = versionSpec.trim();
  if (spec.startsWith('workspace:')) return true;
  if (/^[~^]?2(?:\.|$)/.test(spec)) return true;
  if (/(?:^|\s|\|)\s*>=?\s*2(?:\.|\s|$)/.test(spec) && /<\s*3(?:\.|\s|$)/.test(spec)) return true;
  return false;
}

function packageCheck(packageJson: PackageJson, name: string, required: boolean): DoctorCheck {
  const version = declaredVersion(packageJson, name);
  return {
    name,
    ok: version !== undefined,
    detail: version ?? 'not declared in package.json',
    required,
  };
}

function solidVersionCheck(packageJson: PackageJson): DoctorCheck {
  const version = declaredVersion(packageJson, 'solid-js');
  if (!version) {
    return { name: 'solid-js 2', ok: false, detail: 'solid-js is not declared in package.json', required: true };
  }
  return {
    name: 'solid-js 2',
    ok: supportsSolid2(version),
    detail: version,
    required: true,
  };
}

function nativeProjectCheck(projectRoot: string, target: DevicePlatform, configuredPath?: string): DoctorCheck {
  if (target === 'ios') {
    const path = configuredPath ? resolve(projectRoot, configuredPath) : join(projectRoot, 'ios');
    return {
      name: 'ios project',
      ok: existsSync(path),
      detail: existsSync(path) ? path : `${path} does not exist`,
      required: true,
    };
  }

  const path = configuredPath ? resolve(projectRoot, configuredPath) : join(projectRoot, 'android');
  return {
    name: 'android project',
    ok: existsSync(path),
    detail: existsSync(path) ? path : `${path} does not exist`,
    required: true,
  };
}

export async function collectProjectChecks(
  projectRoot = process.cwd(),
  target?: DevicePlatform,
): Promise<DoctorCheck[]> {
  const root = resolve(projectRoot);
  const packagePath = join(root, 'package.json');
  if (!existsSync(packagePath)) {
    return [{
      name: 'sting project',
      ok: false,
      detail: `package.json not found in ${root}`,
      required: true,
    }];
  }

  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ name: 'sting project', ok: false, detail: `invalid package.json: ${message}`, required: true }];
  }

  const checks: DoctorCheck[] = [
    { name: 'sting project', ok: true, detail: root, required: true },
    packageCheck(packageJson, '@stingjs/solid', true),
    solidVersionCheck(packageJson),
    {
      name: 'build script',
      ok: typeof packageJson.scripts?.build === 'string' && packageJson.scripts.build.length > 0,
      detail: packageJson.scripts?.build ?? 'package.json scripts.build is missing',
      required: true,
    },
  ];

  const configPath = findStingConfig(root);
  if (!configPath) {
    checks.push({
      name: 'sting config',
      ok: true,
      detail: 'not present; CLI will use project inference',
      required: false,
      skipped: true,
    });
    if (target) checks.push(nativeProjectCheck(root, target));
    return checks;
  }

  try {
    const loaded = await loadStingConfig(root);
    checks.push({ name: 'sting config', ok: true, detail: loaded?.path ?? configPath, required: false });
    if (target === 'ios') checks.push(nativeProjectCheck(root, target, loaded?.config.ios?.project));
    if (target === 'android') checks.push(nativeProjectCheck(root, target, loaded?.config.android?.directory));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'sting config', ok: false, detail: message, required: true });
  }

  return checks;
}
