import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { findStingConfig, loadStingConfig, type LoadedStingConfig } from './config.js';
import type { DoctorCheck } from './platform.js';

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
}

function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
        name: 'package.json',
        ok: false,
        detail: `${packagePath} does not exist`,
        required: true,
      },
    };
  }

  try {
    const value = JSON.parse(readFileSync(packagePath, 'utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('must contain a JSON object');
    }
    return {
      check: { name: 'package.json', ok: true, detail: packagePath, required: true },
      packageJson: value as PackageJson,
    };
  } catch (error) {
    return {
      check: {
        name: 'package.json',
        ok: false,
        detail: `${packagePath}: ${failureDetail(error)}`,
        required: true,
      },
    };
  }
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

export async function collectProjectDoctorContext(projectRoot = process.cwd()): Promise<ProjectDoctorContext> {
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

  const checks: DoctorCheck[] = [configCheck(sourcePath, loaded, configError)];
  const packageResult = readPackageJson(root);
  checks.push(packageResult.check, buildScriptCheck(packageResult.packageJson));

  const iosConfigured = loaded?.config.ios !== undefined;
  const androidConfigured = loaded?.config.android !== undefined;
  const defaultIosDirectory = join(root, 'ios');
  const defaultAndroidDirectory = join(root, 'android');
  const ios = iosConfigured || existsSync(defaultIosDirectory);
  const android = androidConfigured || existsSync(defaultAndroidDirectory);

  if (ios) {
    const configuredProject = loaded?.config.ios?.project;
    if (configuredProject) {
      checks.push(pathCheck('ios project', resolve(root, configuredProject)));
    } else {
      checks.push(pathCheck('ios project directory', defaultIosDirectory));
    }
  }

  let androidGradleWrapper = false;
  if (android) {
    const androidDirectory = resolve(root, loaded?.config.android?.directory ?? 'android');
    checks.push(pathCheck('android project directory', androidDirectory));
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
