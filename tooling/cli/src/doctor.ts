import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { findStingConfig, loadStingConfig, type LoadedStingConfig } from './config.js';
import type { DevicePlatform, DoctorCheck } from './platform.js';

export interface DoctorPlatforms {
  ios: boolean;
  android: boolean;
}

export interface ProjectDoctorContext {
  projectRoot: string;
  configPath?: string;
  platforms: DoctorPlatforms;
  androidGradleWrapper: boolean;
  requiresSystemGradle: boolean;
  checks: DoctorCheck[];
}

interface PackageJson {
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function declaredVersion(packageJson: PackageJson | undefined, name: string): string | undefined {
  const value = packageJson?.dependencies?.[name]
    ?? packageJson?.devDependencies?.[name]
    ?? packageJson?.peerDependencies?.[name];
  return typeof value === 'string' ? value : undefined;
}

export function supportsSolid2(versionSpec: string): boolean {
  const spec = versionSpec.trim();
  if (spec.startsWith('workspace:')) return true;
  if (/^[~^]?2(?:\.|$)/.test(spec)) return true;
  return /(?:^|\s|\|)\s*>=?\s*2(?:\.|\s|$)/.test(spec) && /<\s*3(?:\.|\s|$)/.test(spec);
}

function pathCheck(name: string, path: string, required = true): DoctorCheck {
  const ok = existsSync(path);
  return {
    name,
    ok,
    detail: ok ? path : `${path} does not exist`,
    required,
  };
}

function readPackageJson(projectRoot: string): { check: DoctorCheck; packageJson?: PackageJson } {
  const packagePath = join(projectRoot, 'package.json');
  if (!existsSync(packagePath)) {
    return {
      check: {
        name: 'sting project',
        ok: false,
        detail: `package.json not found in ${projectRoot}`,
        required: true,
      },
    };
  }

  try {
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('package.json must contain a JSON object');
    }
    return {
      check: { name: 'sting project', ok: true, detail: projectRoot, required: true },
      packageJson: value as PackageJson,
    };
  } catch (error) {
    return {
      check: {
        name: 'sting project',
        ok: false,
        detail: `invalid package.json: ${failureDetail(error)}`,
        required: true,
      },
    };
  }
}

function packageCheck(packageJson: PackageJson | undefined, name: string): DoctorCheck {
  const version = declaredVersion(packageJson, name);
  return {
    name,
    ok: version !== undefined,
    detail: version ?? 'not declared in package.json',
    required: true,
  };
}

function solidVersionCheck(packageJson: PackageJson | undefined): DoctorCheck {
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

function buildScriptCheck(packageJson: PackageJson | undefined): DoctorCheck {
  const build = packageJson?.scripts?.build;
  const ok = typeof build === 'string' && build.trim().length > 0;
  return {
    name: 'build script',
    ok,
    detail: ok ? `npm run build → ${build}` : 'package.json scripts.build is required for normal Sting bundling',
    required: true,
  };
}

function configCheck(sourcePath: string | undefined, loaded: LoadedStingConfig | undefined, error: unknown): DoctorCheck {
  if (error !== undefined) {
    return {
      name: 'sting config',
      ok: false,
      detail: sourcePath ? `${basename(sourcePath)}: ${failureDetail(error)}` : failureDetail(error),
      required: true,
    };
  }
  if (loaded) {
    return { name: 'sting config', ok: true, detail: loaded.path, required: false };
  }
  return {
    name: 'sting config',
    ok: true,
    detail: 'not found; native project settings will be inferred',
    required: false,
    skipped: true,
  };
}

export async function collectProjectDoctorContext(
  projectRoot = process.cwd(),
  target?: DevicePlatform,
): Promise<ProjectDoctorContext> {
  const root = resolve(projectRoot);
  const sourcePath = findStingConfig(root);
  let loaded: LoadedStingConfig | undefined;
  let configError: unknown;

  if (sourcePath) {
    try {
      loaded = await loadStingConfig(root);
    } catch (error) {
      configError = error;
    }
  }

  const packageResult = readPackageJson(root);
  const checks: DoctorCheck[] = [
    packageResult.check,
    packageCheck(packageResult.packageJson, '@stingjs/solid'),
    solidVersionCheck(packageResult.packageJson),
    buildScriptCheck(packageResult.packageJson),
    configCheck(sourcePath, loaded, configError),
  ];

  const defaultIosDirectory = join(root, 'ios');
  const defaultAndroidDirectory = join(root, 'android');
  const inferredIos = loaded?.config.ios !== undefined || existsSync(defaultIosDirectory);
  const inferredAndroid = loaded?.config.android !== undefined || existsSync(defaultAndroidDirectory);
  const ios = target ? target === 'ios' : inferredIos;
  const android = target ? target === 'android' : inferredAndroid;

  if (ios) {
    const configuredProject = loaded?.config.ios?.project;
    checks.push(configuredProject
      ? pathCheck('ios project', resolve(root, configuredProject))
      : pathCheck('ios project', defaultIosDirectory));
  }

  let androidGradleWrapper = false;
  if (android) {
    const androidDirectory = resolve(root, loaded?.config.android?.directory ?? 'android');
    checks.push(pathCheck('android project', androidDirectory));
    androidGradleWrapper = existsSync(join(androidDirectory, 'gradlew')) || existsSync(join(androidDirectory, 'gradlew.bat'));
    checks.push({
      name: 'android gradle wrapper',
      ok: androidGradleWrapper,
      detail: androidGradleWrapper
        ? `wrapper available in ${androidDirectory}`
        : 'wrapper not found; Sting will require a system Gradle installation as a fallback',
      required: false,
    });
  }

  return {
    projectRoot: root,
    configPath: loaded?.path ?? sourcePath,
    platforms: { ios, android },
    androidGradleWrapper,
    requiresSystemGradle: android && !androidGradleWrapper,
    checks,
  };
}
