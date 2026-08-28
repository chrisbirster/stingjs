import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set([
  '', '.bat', '.gitignore', '.json', '.kts', '.kt', '.md', '.pbxproj', '.properties', '.swift', '.ts', '.tsx', '.xml', '.sh', '.xcscheme',
]);
const GRADLE_WRAPPER_VERSION = '9.5.0';
const GRADLE_WRAPPER_URL = `https://services.gradle.org/distributions/gradle-${GRADLE_WRAPPER_VERSION}-wrapper.jar`;
const GRADLE_WRAPPER_SHA256 = '497c8c2a7e5031f6aa847f88104aa80a93532ec32ee17bdb8d1d2f67a194a9c7';

export interface CreateStingProjectOptions {
  targetDir: string;
  projectName?: string;
  androidPackage?: string;
  iosBundleIdentifier?: string;
  runtimeArtifactsDir?: string;
  iosRuntimeArtifactsDir?: string;
  gradleWrapperJarPath?: string;
  force?: boolean;
}

export interface CreatedStingProject {
  targetDir: string;
  projectName: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  runtimeArtifactsDir: string;
  iosRuntimeArtifactsDir: string;
}

function packagePath(packageName: string): string {
  return packageName.replaceAll('.', '/');
}

function defaultProjectName(targetDir: string): string {
  return basename(resolve(targetDir))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sting-app';
}

function validateProjectName(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid project name: ${value}. Use lowercase letters, numbers, dots, underscores, and hyphens.`);
  }
  return value;
}

function validateAndroidPackage(value: string): string {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(value)) {
    throw new Error(`Invalid Android package: ${value}. Example: com.example.myapp`);
  }
  return value;
}

function validateIosBundleIdentifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$/.test(value)) {
    throw new Error(`Invalid iOS bundle identifier: ${value}. Example: com.example.myapp`);
  }
  return value;
}

function resolveRuntimeArtifacts(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.STING_ANDROID_HOST_ARTIFACTS,
    fileURLToPath(new URL('../runtime/android', import.meta.url)),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const directory = resolve(candidate);
    if (
      existsSync(join(directory, 'sting-runtime.aar')) &&
      existsSync(join(directory, 'sting-quickjs.aar'))
    ) {
      return directory;
    }
  }

  throw new Error(
    'Sting Android host artifacts were not found. Pass --runtime-artifacts <dir>, set STING_ANDROID_HOST_ARTIFACTS, or package the AARs under runtime/android.',
  );
}

function isIosRuntimePackage(directory: string): boolean {
  return (
    existsSync(join(directory, 'Package.swift')) &&
    existsSync(join(directory, 'Sources', 'StingQuickJSRuntime')) &&
    existsSync(join(directory, 'Artifacts', 'StingQuickJSBinary.xcframework'))
  );
}

function resolveIosRuntimeArtifacts(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.STING_IOS_HOST_ARTIFACTS,
    fileURLToPath(new URL('../runtime/ios', import.meta.url)),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const directory = resolve(candidate);
    for (const packageDirectory of [directory, join(directory, 'StingQuickJSRuntime')]) {
      if (isIosRuntimePackage(packageDirectory)) return packageDirectory;
    }
  }

  throw new Error(
    'Sting iOS host artifacts were not found. Pass --ios-runtime-artifacts <dir>, set STING_IOS_HOST_ARTIFACTS, or package StingQuickJSRuntime under runtime/ios.',
  );
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyOfficialGradleWrapper(path: string): void {
  const actual = sha256(path);
  if (actual !== GRADLE_WRAPPER_SHA256) {
    throw new Error(
      `Gradle ${GRADLE_WRAPPER_VERSION} wrapper checksum mismatch: expected ${GRADLE_WRAPPER_SHA256}, got ${actual}`,
    );
  }
}

function downloadOfficialGradleWrapper(target: string): void {
  mkdirSync(dirname(target), { recursive: true });
  const script = `
const { writeFileSync } = require('node:fs');
const [url, target] = process.argv.slice(1);
fetch(url).then(async (response) => {
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
  try {
    execFileSync(process.execPath, ['-e', script, GRADLE_WRAPPER_URL, target], { stdio: 'inherit' });
  } catch {
    throw new Error(`Unable to download the official Gradle ${GRADLE_WRAPPER_VERSION} wrapper from ${GRADLE_WRAPPER_URL}.`);
  }
  verifyOfficialGradleWrapper(target);
}

function installGradleWrapperJar(target: string, explicit?: string): void {
  const trustedOverride = explicit ?? process.env.STING_GRADLE_WRAPPER_JAR;
  if (trustedOverride) {
    const source = resolve(trustedOverride);
    if (!existsSync(source)) throw new Error(`Gradle wrapper JAR was not found: ${source}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    return;
  }

  const packaged = fileURLToPath(new URL('../runtime/gradle/gradle-wrapper.jar', import.meta.url));
  if (existsSync(packaged)) {
    verifyOfficialGradleWrapper(packaged);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(packaged, target);
    return;
  }

  downloadOfficialGradleWrapper(target);
}

function assertTargetAvailable(targetDir: string, force: boolean): void {
  if (!existsSync(targetDir)) return;
  const entries = readdirSync(targetDir);
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${targetDir}. Pass --force to overwrite generated files.`);
  }
}

function textExtension(path: string): string {
  const name = basename(path);
  if (name === '.gitignore') return '.gitignore';
  if (name === 'project.pbxproj') return '.pbxproj';
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index);
}

function render(value: string, replacements: Record<string, string>): string {
  let result = value;
  for (const [key, replacement] of Object.entries(replacements)) {
    result = result.replaceAll(`__${key}__`, replacement);
  }
  return result;
}

function copyTemplateDirectory(
  sourceRoot: string,
  targetRoot: string,
  replacements: Record<string, string>,
): void {
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry);
    const renderedEntry = render(entry, replacements).replace(/\.tpl$/, '');
    const target = join(targetRoot, renderedEntry);
    const stat = statSync(source);

    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyTemplateDirectory(source, target, replacements);
      continue;
    }

    mkdirSync(dirname(target), { recursive: true });
    if (TEXT_EXTENSIONS.has(textExtension(renderedEntry))) {
      writeFileSync(target, render(readFileSync(source, 'utf8'), replacements), 'utf8');
    } else {
      copyFileSync(source, target);
    }
    chmodSync(target, stat.mode & 0o777);
  }
}

export function createStingProject(options: CreateStingProjectOptions): CreatedStingProject {
  const targetDir = resolve(options.targetDir);
  const projectName = validateProjectName(options.projectName ?? defaultProjectName(targetDir));
  const androidPackage = validateAndroidPackage(
    options.androidPackage ?? `run.stingjs.apps.${projectName.replace(/[^a-z0-9_]/g, '_')}`,
  );
  const iosBundleIdentifier = validateIosBundleIdentifier(options.iosBundleIdentifier ?? androidPackage);
  const runtimeArtifactsDir = resolveRuntimeArtifacts(options.runtimeArtifactsDir);
  const iosRuntimeArtifactsDir = resolveIosRuntimeArtifacts(options.iosRuntimeArtifactsDir);
  const force = options.force ?? false;

  assertTargetAvailable(targetDir, force);
  mkdirSync(targetDir, { recursive: true });

  const templateRoot = fileURLToPath(new URL('../template', import.meta.url));
  copyTemplateDirectory(templateRoot, targetDir, {
    PROJECT_NAME: projectName,
    PROJECT_DISPLAY_NAME: projectName.replace(/[-_]+/g, ' '),
    ANDROID_PACKAGE: androidPackage,
    ANDROID_PACKAGE_PATH: packagePath(androidPackage),
    IOS_BUNDLE_IDENTIFIER: iosBundleIdentifier,
  });

  const libs = join(targetDir, 'android', 'app', 'libs');
  mkdirSync(libs, { recursive: true });
  cpSync(join(runtimeArtifactsDir, 'sting-runtime.aar'), join(libs, 'sting-runtime.aar'));
  cpSync(join(runtimeArtifactsDir, 'sting-quickjs.aar'), join(libs, 'sting-quickjs.aar'));
  installGradleWrapperJar(
    join(targetDir, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    options.gradleWrapperJarPath,
  );

  const iosRuntimeTarget = join(targetDir, 'ios', 'StingQuickJSRuntime');
  rmSync(iosRuntimeTarget, { recursive: true, force: true });
  cpSync(iosRuntimeArtifactsDir, iosRuntimeTarget, { recursive: true });

  return {
    targetDir,
    projectName,
    androidPackage,
    iosBundleIdentifier,
    runtimeArtifactsDir,
    iosRuntimeArtifactsDir,
  };
}
