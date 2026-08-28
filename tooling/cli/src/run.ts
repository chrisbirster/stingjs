import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { collectDevices, type DevicePlatform, type StingDevice } from './platform.js';

export interface RunOptions {
  projectRoot?: string;
  device?: string;
  configuration?: string;
  skipBundle?: boolean;
}

export interface RunResult {
  platform: DevicePlatform;
  device: StingDevice;
  applicationId: string;
}

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  capture?: boolean;
}

function commandName(name: string): string {
  if (process.platform !== 'win32') return name;
  if (name === 'npm') return 'npm.cmd';
  if (name === 'gradle') return 'gradle.bat';
  return name;
}

function execute(command: string, args: string[], options: CommandOptions = {}): string {
  const capture = options.capture ?? false;
  const executable = commandName(command);
  const shell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
    shell,
  });

  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = capture && typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${command} exited with code ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return capture && typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

export function selectDevice(devices: StingDevice[], platform: DevicePlatform, requested?: string): StingDevice {
  const candidates = devices.filter((device) => device.platform === platform);
  const usable = platform === 'android'
    ? candidates.filter((device) => device.state === 'device')
    : candidates;

  if (requested) {
    const normalized = requested.toLowerCase();
    const match = usable.find((device) => device.id === requested || device.name.toLowerCase() === normalized);
    if (match) return match;
    const available = usable.map((device) => `${device.name} (${device.id})`).join(', ');
    throw new Error(`No ${platform} device matches "${requested}"${available ? `. Available: ${available}` : ''}`);
  }

  const preferred = platform === 'ios'
    ? usable.find((device) => device.state === 'booted')
    : usable[0];
  const selected = preferred ?? usable[0];
  if (!selected) {
    throw new Error(platform === 'ios'
      ? 'No available iOS simulators found. Run `sting devices` to inspect the environment.'
      : 'No connected Android devices or emulators found. Run `sting devices` to inspect the environment.');
  }
  return selected;
}

export function parseAndroidApplicationId(buildFile: string): string | undefined {
  const match = buildFile.match(/applicationId\s*(?:=\s*)?["']([^"']+)["']/);
  return match?.[1];
}

export function parseXcodeBuildSetting(output: string, key: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (match?.[1] === key && match[2]) return match[2];
  }
  return undefined;
}

function buildJavaScript(projectRoot: string): void {
  execute('npm', ['run', 'build'], { cwd: projectRoot });
}

function findSingleEntry(directory: string, suffix: string, label: string): string {
  if (!existsSync(directory)) throw new Error(`${label} directory not found: ${directory}`);
  const matches = readdirSync(directory).filter((entry) => entry.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} ${suffix} in ${directory}; found ${matches.length}`);
  }
  return join(directory, matches[0]);
}

function iosScheme(projectPath: string): string {
  const schemesDirectory = join(projectPath, 'xcshareddata', 'xcschemes');
  if (existsSync(schemesDirectory)) {
    const schemes = readdirSync(schemesDirectory).filter((entry) => entry.endsWith('.xcscheme'));
    if (schemes.length === 1) return basename(schemes[0], '.xcscheme');
  }
  return basename(projectPath, '.xcodeproj');
}

function findBuiltIosApp(derivedData: string, configuration: string, scheme: string): string {
  const products = join(derivedData, 'Build', 'Products', `${configuration}-iphonesimulator`);
  const expected = join(products, `${scheme}.app`);
  if (existsSync(expected)) return expected;
  if (!existsSync(products)) throw new Error(`iOS build products were not found at ${products}`);
  const apps = readdirSync(products).filter((entry) => entry.endsWith('.app'));
  if (apps.length !== 1) throw new Error(`Expected one built iOS app in ${products}; found ${apps.length}`);
  return join(products, apps[0]);
}

export function runIos(options: RunOptions = {}): RunResult {
  if (process.platform !== 'darwin') throw new Error('`sting run ios` requires macOS and Xcode.');
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const device = selectDevice(collectDevices('darwin'), 'ios', options.device);
  const configuration = options.configuration ?? 'Debug';

  if (!options.skipBundle) buildJavaScript(projectRoot);
  if (device.state !== 'booted') execute('xcrun', ['simctl', 'boot', device.id]);

  const iosDirectory = join(projectRoot, 'ios');
  const projectPath = findSingleEntry(iosDirectory, '.xcodeproj', 'iOS project');
  const scheme = iosScheme(projectPath);
  const derivedData = join(projectRoot, '.sting', 'ios');
  mkdirSync(derivedData, { recursive: true });

  const baseArgs = [
    '-project', projectPath,
    '-scheme', scheme,
    '-configuration', configuration,
    '-sdk', 'iphonesimulator',
    '-destination', `id=${device.id}`,
    '-derivedDataPath', derivedData,
  ];
  execute('xcodebuild', [...baseArgs, 'build']);

  const settings = execute('xcodebuild', [...baseArgs, '-showBuildSettings'], { capture: true });
  const applicationId = parseXcodeBuildSetting(settings, 'PRODUCT_BUNDLE_IDENTIFIER');
  if (!applicationId) throw new Error('Could not determine PRODUCT_BUNDLE_IDENTIFIER from Xcode build settings.');

  const appPath = findBuiltIosApp(derivedData, configuration, scheme);
  execute('xcrun', ['simctl', 'install', device.id, appPath]);
  execute('xcrun', ['simctl', 'launch', device.id, applicationId]);
  return { platform: 'ios', device, applicationId };
}

function androidBuildFile(androidDirectory: string): string {
  const kotlin = join(androidDirectory, 'app', 'build.gradle.kts');
  if (existsSync(kotlin)) return kotlin;
  const groovy = join(androidDirectory, 'app', 'build.gradle');
  if (existsSync(groovy)) return groovy;
  throw new Error(`Android app build file not found under ${join(androidDirectory, 'app')}`);
}

function gradleCommand(androidDirectory: string): { command: string; argsPrefix: string[] } {
  if (process.platform === 'win32') {
    const wrapper = join(androidDirectory, 'gradlew.bat');
    if (existsSync(wrapper)) return { command: wrapper, argsPrefix: [] };
  } else {
    const wrapper = join(androidDirectory, 'gradlew');
    if (existsSync(wrapper)) return { command: wrapper, argsPrefix: [] };
  }
  return { command: 'gradle', argsPrefix: [] };
}

export function runAndroid(options: RunOptions = {}): RunResult {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const device = selectDevice(collectDevices(process.platform), 'android', options.device);
  const androidDirectory = join(projectRoot, 'android');
  if (!existsSync(androidDirectory)) throw new Error(`Android project directory not found: ${androidDirectory}`);

  if (!options.skipBundle) buildJavaScript(projectRoot);

  const buildFile = androidBuildFile(androidDirectory);
  const applicationId = parseAndroidApplicationId(readFileSync(buildFile, 'utf8'));
  if (!applicationId) throw new Error(`Could not determine applicationId from ${buildFile}`);

  const gradle = gradleCommand(androidDirectory);
  execute(gradle.command, [...gradle.argsPrefix, ':app:installDebug'], {
    cwd: androidDirectory,
    env: { ...process.env, ANDROID_SERIAL: device.id },
  });
  execute('adb', ['-s', device.id, 'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1']);
  return { platform: 'android', device, applicationId };
}
