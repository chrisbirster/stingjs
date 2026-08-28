import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { loadStingConfig } from './config.js';
import { collectProjectDoctorContext } from './doctor.js';
import { collectDoctorChecks, type DevicePlatform, type DoctorCheck } from './platform.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

export interface VerifyOptions {
  projectRoot?: string;
  target?: DevicePlatform;
}

export interface VerifyResult {
  projectRoot: string;
  target?: DevicePlatform;
  scripts: string[];
  nativeBuild: boolean;
}

function commandName(name: string): string {
  if (process.platform !== 'win32') return name;
  if (name === 'npm') return 'npm.cmd';
  if (name === 'gradle') return 'gradle.bat';
  return name;
}

function execute(command: string, args: string[], cwd: string): void {
  const executable = commandName(command);
  const shell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
  const result = spawnSync(executable, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell,
  });
  if (result.error) throw new Error(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

export function selectedAppScripts(packageJson: PackageJson): string[] {
  const scripts = packageJson.scripts ?? {};
  const selected: string[] = [];
  if (scripts.typecheck) selected.push('typecheck');
  if (scripts.test) selected.push('test');
  if (scripts.build) selected.push('build');
  return selected;
}

function readPackage(projectRoot: string): PackageJson {
  const packagePath = join(projectRoot, 'package.json');
  if (!existsSync(packagePath)) throw new Error(`package.json not found in ${projectRoot}`);
  return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;
}

function findSingleEntry(directory: string, suffix: string, label: string): string {
  if (!existsSync(directory)) throw new Error(`${label} directory not found: ${directory}`);
  const matches = readdirSync(directory).filter((entry) => entry.endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} ${suffix} in ${directory}; found ${matches.length}`);
  return join(directory, matches[0]);
}

function inferIosScheme(projectPath: string): string {
  const schemesDirectory = join(projectPath, 'xcshareddata', 'xcschemes');
  if (existsSync(schemesDirectory)) {
    const schemes = readdirSync(schemesDirectory).filter((entry) => entry.endsWith('.xcscheme'));
    if (schemes.length === 1) return basename(schemes[0], '.xcscheme');
  }
  return basename(projectPath, '.xcodeproj');
}

async function buildIos(projectRoot: string): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('`sting test ios` and `sting ci ios` require macOS and Xcode.');
  const loaded = await loadStingConfig(projectRoot);
  const ios = loaded?.config.ios;
  const projectPath = ios?.project
    ? resolve(projectRoot, ios.project)
    : findSingleEntry(join(projectRoot, 'ios'), '.xcodeproj', 'iOS project');
  if (!existsSync(projectPath)) throw new Error(`Configured iOS project not found: ${projectPath}`);
  const scheme = ios?.scheme ?? inferIosScheme(projectPath);
  const configuration = ios?.configuration ?? 'Debug';
  execute('xcodebuild', [
    '-project', projectPath,
    '-scheme', scheme,
    '-configuration', configuration,
    '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator',
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ], projectRoot);
}

function gradleCommand(androidDirectory: string): string {
  if (process.platform === 'win32') {
    const wrapper = join(androidDirectory, 'gradlew.bat');
    if (existsSync(wrapper)) return wrapper;
  } else {
    const wrapper = join(androidDirectory, 'gradlew');
    if (existsSync(wrapper)) return wrapper;
  }
  return 'gradle';
}

function gradleVariant(value: string): string {
  if (!value) throw new Error('Android variant cannot be empty.');
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

async function buildAndroid(projectRoot: string): Promise<void> {
  const loaded = await loadStingConfig(projectRoot);
  const android = loaded?.config.android;
  const androidDirectory = android?.directory
    ? resolve(projectRoot, android.directory)
    : join(projectRoot, 'android');
  if (!existsSync(androidDirectory)) throw new Error(`Android project directory not found: ${androidDirectory}`);
  const variant = android?.variant ?? 'debug';
  execute(gradleCommand(androidDirectory), [`:app:assemble${gradleVariant(variant)}`], androidDirectory);
}

function formatFailedChecks(checks: DoctorCheck[]): string {
  return checks
    .filter((check) => check.required && !check.ok)
    .map((check) => `${check.name}: ${check.detail}`)
    .join('\n');
}

export async function verifyDoctor(options: VerifyOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const project = await collectProjectDoctorContext(projectRoot, options.target);
  const environment = collectDoctorChecks(process.platform, {
    target: options.target,
    android: options.target ? undefined : project.platforms.android,
    ios: options.target ? undefined : project.platforms.ios,
    requireSystemGradle: project.requiresSystemGradle,
  });
  const failures = formatFailedChecks([...environment, ...project.checks]);
  if (failures) throw new Error(`Sting doctor failed:\n${failures}`);
}

export async function runTests(options: VerifyOptions = {}): Promise<VerifyResult> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const packageJson = readPackage(projectRoot);
  const scripts = selectedAppScripts(packageJson);
  if (!scripts.includes('build')) throw new Error('Sting applications must define package.json scripts.build.');

  for (const script of scripts) execute('npm', ['run', script], projectRoot);

  if (options.target === 'ios') await buildIos(projectRoot);
  if (options.target === 'android') await buildAndroid(projectRoot);

  return {
    projectRoot,
    target: options.target,
    scripts,
    nativeBuild: options.target !== undefined,
  };
}

export async function runCi(options: VerifyOptions = {}): Promise<VerifyResult> {
  await verifyDoctor(options);
  return runTests(options);
}
