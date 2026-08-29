#!/usr/bin/env node
import { resolve } from 'node:path';
import { startBuildWatcher } from './build-watch.js';
import { loadStingConfig } from './config.js';
import { openStingGo } from './dev-open.js';
import { resolveDevelopmentMode, type DevelopmentCommand } from './development.js';
import { collectProjectDoctorContext } from './doctor.js';
import { collectDevices, collectDoctorChecks, type DevicePlatform, type DoctorCheck } from './platform.js';
import { renderTerminalQr, shouldRenderTerminalQr } from './qr.js';
import { runAndroid, runIos } from './run.js';
import { startStingServer } from './start.js';
import { runCi, runTests } from './verify.js';

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function parseTarget(args: string[]): { target?: DevicePlatform; rest: string[] } {
  const first = args[0];
  if (first === 'ios' || first === 'android') return { target: first, rest: args.slice(1) };
  return { rest: args };
}

function printHelp(): void {
  console.log(`Sting developer CLI\n\nUsage:\n  sting doctor [ios|android] [--project-root <path>] [--runtime] [--json]\n  sting devices [--json]\n  sting config [--project-root <path>] [--json]\n  sting test [ios|android] [--project-root <path>]\n  sting ci [ios|android] [--project-root <path>]\n  sting dev [--project-root <path>] [--bundle <path>] [--host <host>] [--port <port>] [--open] [--device <id|name>] [--qr|--no-qr] [--json]\n  sting start [--project-root <path>] [--bundle <path>] [--host <host>] [--port <port>] [--watch] [--qr|--no-qr] [--json]\n  sting run ios [--project-root <path>] [--device <id|name>] [--configuration <name>] [--no-bundle]\n  sting run android [--project-root <path>] [--device <id|name>] [--variant <name>] [--no-bundle]\n\nCommands:\n  doctor   Validate the Sting app and required local platform toolchain; target ios/android for an explicit platform gate\n  devices  List Android devices and available iOS simulators\n  config   Load and validate sting.config.ts (or JS variants)\n  test     Run app typecheck/tests/build; target ios/android to add a native build\n  ci       Run doctor followed by the same deterministic test/build pipeline\n  dev      Build, watch, serve, and live-reload through Sting Go; --open sends the deep link to a ready device\n  start    Serve a built Sting bundle to Sting Go; --watch preserves the lower-level managed watcher mode\n  run      Build, install, and launch a Sting app on iOS or Android\n`);
}

function printChecks(checks: DoctorCheck[]): void {
  for (const check of checks) {
    const symbol = check.skipped ? '-' : check.ok ? '✓' : check.required ? '✗' : '!';
    const qualifier = check.skipped ? ' (not required)' : check.required ? '' : ' (optional)';
    console.log(`${symbol} ${check.name}${qualifier}: ${check.detail}`);
  }
}

async function doctor(args: string[]): Promise<void> {
  const parsed = parseTarget(args);
  const runtimeDevelopment = hasFlag(parsed.rest, '--runtime');
  const projectRoot = resolve(option(parsed.rest, '--project-root') ?? process.cwd());

  if (runtimeDevelopment && !parsed.target) {
    const checks = collectDoctorChecks(process.platform, { runtimeDevelopment: true });
    if (hasFlag(parsed.rest, '--json')) {
      console.log(JSON.stringify({ mode: 'runtime', target: null, projectRoot, platforms: { ios: false, android: false }, checks }));
    } else {
      console.log('Sting doctor (runtime development)\n');
      printChecks(checks);
    }
    if (checks.some((check) => check.required && !check.ok)) process.exitCode = 1;
    return;
  }

  const project = await collectProjectDoctorContext(projectRoot, parsed.target);
  const environmentChecks = collectDoctorChecks(process.platform, {
    runtimeDevelopment,
    target: parsed.target,
    android: parsed.target ? undefined : project.platforms.android,
    ios: parsed.target ? undefined : project.platforms.ios,
    requireSystemGradle: project.requiresSystemGradle,
  });
  const checks = [...environmentChecks, ...project.checks];

  if (hasFlag(parsed.rest, '--json')) {
    console.log(JSON.stringify({
      mode: runtimeDevelopment ? 'runtime' : 'app',
      target: parsed.target ?? null,
      projectRoot: project.projectRoot,
      configPath: project.configPath,
      platforms: project.platforms,
      checks,
    }));
  } else {
    const targetLabel = parsed.target === 'ios' ? 'iOS' : parsed.target === 'android' ? 'Android' : undefined;
    const modeLabel = runtimeDevelopment ? 'runtime development' : targetLabel;
    console.log(modeLabel ? `Sting doctor (${modeLabel})\n` : 'Sting doctor\n');
    console.log(`Project: ${project.projectRoot}`);
    const targets = [project.platforms.ios ? 'ios' : undefined, project.platforms.android ? 'android' : undefined]
      .filter((platform): platform is string => platform !== undefined);
    console.log(`Targets: ${targets.length > 0 ? targets.join(', ') : 'none detected'}\n`);
    console.log('Environment');
    printChecks(environmentChecks);
    console.log('\nProject');
    printChecks(project.checks);
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

async function verify(command: 'test' | 'ci', args: string[]): Promise<void> {
  const parsed = parseTarget(args);
  const projectRoot = option(parsed.rest, '--project-root');
  const result = command === 'test'
    ? await runTests({ projectRoot, target: parsed.target })
    : await runCi({ projectRoot, target: parsed.target });
  const target = result.target ? ` + ${result.target} native build` : '';
  console.log(`\nSting ${command} passed: ${result.scripts.join(', ')}${target}`);
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

async function development(command: DevelopmentCommand, args: string[]): Promise<void> {
  const mode = resolveDevelopmentMode(command, args);
  const projectRoot = resolve(option(args, '--project-root') ?? process.cwd());
  const loaded = await loadStingConfig(projectRoot);
  const portValue = option(args, '--port');
  const port = portValue === undefined ? undefined : Number.parseInt(portValue, 10);
  if (portValue !== undefined && (!Number.isInteger(port) || (port ?? -1) < 0 || (port ?? 0) > 65535)) {
    throw new Error(`Invalid --port value: ${portValue}`);
  }

  const watcher = mode.watch ? startBuildWatcher(projectRoot) : undefined;
  let started: Awaited<ReturnType<typeof startStingServer>>;
  try {
    started = await startStingServer({
      projectRoot,
      bundlePath: option(args, '--bundle') ?? loaded?.config.bundle,
      host: option(args, '--host'),
      port,
      watchBundle: mode.watch,
      onClientReport: (report) => {
        console.error(`\nSting Go ${report.platform} ${report.kind}: ${report.message}`);
        if (report.detail) console.error(report.detail);
      },
    });
  } catch (error) {
    watcher?.close();
    throw error;
  }

  let openedDevice: ReturnType<typeof openStingGo> | undefined;
  if (command === 'dev' && hasFlag(args, '--open')) {
    try {
      openedDevice = openStingGo(started.stingGoUrl, {
        requestedDevice: option(args, '--device'),
      });
    } catch (error) {
      watcher?.close();
      await started.close();
      throw error;
    }
  }

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify({
      manifestUrl: started.manifestUrl,
      reloadUrl: started.reloadUrl,
      reportUrl: started.reportUrl,
      stingGoUrl: started.stingGoUrl,
      bundlePath: started.bundlePath,
      watching: mode.watch,
      openedDevice: openedDevice ? {
        platform: openedDevice.platform,
        id: openedDevice.id,
        name: openedDevice.name,
      } : undefined,
      manifest: started.manifest,
    }));
  } else {
    console.log(mode.title);
    console.log(`Manifest: ${started.manifestUrl}`);
    console.log(`Reload:   ${started.reloadUrl}`);
    console.log(`Report:   ${started.reportUrl}`);
    console.log(`Sting Go: ${started.stingGoUrl}`);
    console.log(`Bundle:   ${started.bundlePath}`);
    console.log(`Watching: ${mode.watch ? 'yes' : 'no'}`);
    if (openedDevice) {
      console.log(`Opened:   ${openedDevice.name} (${openedDevice.id})`);
    }
    if (shouldRenderTerminalQr(args, process.stdout.isTTY)) {
      console.log('\nScan with Sting Go:\n');
      console.log(await renderTerminalQr(started.stingGoUrl));
    }
    console.log(`\n${mode.guidance}`);
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    watcher?.close();
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
      await doctor(args);
      return;
    case 'devices':
      devices(args);
      return;
    case 'config':
      await config(args);
      return;
    case 'test':
      await verify('test', args);
      return;
    case 'ci':
      await verify('ci', args);
      return;
    case 'dev':
      await development('dev', args);
      return;
    case 'start':
      await development('start', args);
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
