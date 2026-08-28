#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadStingConfig } from './config.js';
import { collectDevices, collectDoctorChecks } from './platform.js';
import { runAndroid, runIos } from './run.js';
import { startStingServer } from './start.js';

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function printHelp(): void {
  console.log(`Sting developer CLI\n\nUsage:\n  sting doctor [--runtime] [--json]\n  sting devices [--json]\n  sting config [--project-root <path>] [--json]\n  sting start [--project-root <path>] [--bundle <path>] [--host <host>] [--port <port>] [--json]\n  sting run ios [--project-root <path>] [--device <id|name>] [--configuration <name>] [--no-bundle]\n  sting run android [--project-root <path>] [--device <id|name>] [--variant <name>] [--no-bundle]\n\nCommands:\n  doctor   Check local Sting app prerequisites; add --runtime for Sting runtime contributor checks\n  devices  List Android devices and available iOS simulators\n  config   Load and validate sting.config.ts (or JS variants)\n  start    Serve a built Sting bundle to Sting Go\n  run      Build, install, and launch a Sting app on iOS or Android\n`);
}

function doctor(args: string[]): void {
  const runtimeDevelopment = hasFlag(args, '--runtime');
  const checks = collectDoctorChecks(process.platform, { runtimeDevelopment });
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ mode: runtimeDevelopment ? 'runtime' : 'app', checks }));
  } else {
    console.log(runtimeDevelopment ? 'Sting doctor (runtime development)\n' : 'Sting doctor\n');
    for (const check of checks) {
      const symbol = check.skipped ? '-' : check.ok ? '✓' : check.required ? '✗' : '!';
      const qualifier = check.skipped ? ' (not required)' : check.required ? '' : ' (optional)';
      console.log(`${symbol} ${check.name}${qualifier}: ${check.detail}`);
    }
  }
  if (checks.some((check) => check.required && !check.ok)) process.exitCode = 1;
}

function devices(args: string[]): void {
  const found = collectDevices();
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ devices: found }));
    return;
  }

  console.log('Sting devices\n');
  if (found.length === 0) {
    console.log('No Android devices or iOS simulators detected.');
    return;
  }

  for (const platform of ['android', 'ios'] as const) {
    const platformDevices = found.filter((device) => device.platform === platform);
    if (platformDevices.length === 0) continue;
    console.log(platform === 'android' ? 'Android' : 'iOS');
    for (const device of platformDevices) {
      console.log(`  ${device.name}  ${device.kind}  ${device.state}  ${device.id}`);
    }
    console.log('');
  }
}

async function config(args: string[]): Promise<void> {
  const projectRoot = resolve(option(args, '--project-root') ?? process.cwd());
  const loaded = await loadStingConfig(projectRoot);
  if (!loaded) {
    throw new Error(`No sting.config.ts (or supported JS config) found in ${projectRoot}`);
  }

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({ path: loaded.path, config: loaded.config }));
    return;
  }

  console.log(`Sting config\n\n${loaded.path}`);
  console.log(JSON.stringify(loaded.config, null, 2));
}

async function run(args: string[]): Promise<void> {
  const [platform, ...runArgs] = args;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error('Usage: sting run <ios|android> [options]');
  }

  const runOptions = {
    projectRoot: option(runArgs, '--project-root'),
    device: option(runArgs, '--device'),
    configuration: option(runArgs, '--configuration'),
    variant: option(runArgs, '--variant'),
    skipBundle: hasFlag(runArgs, '--no-bundle'),
  };
  const result = platform === 'ios' ? await runIos(runOptions) : await runAndroid(runOptions);
  console.log(`\nSting app launched on ${result.device.name} (${result.device.id})`);
  console.log(`Application: ${result.applicationId}`);
}

async function start(args: string[]): Promise<void> {
  const projectRoot = resolve(option(args, '--project-root') ?? process.cwd());
  const loaded = await loadStingConfig(projectRoot);
  const portValue = option(args, '--port');
  const port = portValue === undefined ? undefined : Number.parseInt(portValue, 10);
  if (portValue !== undefined && (!Number.isInteger(port) || (port ?? -1) < 0 || (port ?? 0) > 65535)) {
    throw new Error(`Invalid --port value: ${portValue}`);
  }

  const started = await startStingServer({
    projectRoot,
    bundlePath: option(args, '--bundle') ?? loaded?.config.bundle,
    host: option(args, '--host'),
    port,
  });

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({
      manifestUrl: started.manifestUrl,
      stingGoUrl: started.stingGoUrl,
      bundlePath: started.bundlePath,
      manifest: started.manifest,
    }));
  } else {
    console.log('Sting development server');
    console.log(`Manifest: ${started.manifestUrl}`);
    console.log(`Sting Go: ${started.stingGoUrl}`);
    console.log(`Bundle:   ${started.bundlePath}`);
    console.log('\nOpen the Sting Go URL on a device connected to the same network.');
  }

  const shutdown = async (): Promise<void> => {
    await started.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'doctor':
      doctor(args);
      return;
    case 'devices':
      devices(args);
      return;
    case 'config':
      await config(args);
      return;
    case 'start':
      await start(args);
      return;
    case 'run':
      await run(args);
      return;
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      printHelp();
      return;
    default:
      printHelp();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`sting: ${message}`);
  process.exitCode = 1;
});
