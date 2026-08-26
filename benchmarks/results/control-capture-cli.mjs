import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {controlCaptureDocument, parseBenchmarkCaptures} from './capture.mjs';

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalNumberEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than 0`);
  }
  return value;
}

export async function runControlCaptureCli(argv = process.argv.slice(2)) {
  const [logPath, outputPath] = argv;
  if (!logPath || !outputPath) {
    throw new Error(
      'Usage: node benchmarks/results/control-capture-cli.mjs <xcodebuild-log> <output-json>',
    );
  }

  const source = resolve(logPath);
  const text = await readFile(source, 'utf8');
  const captures = parseBenchmarkCaptures(text, source);

  const metadata = {
    benchmarkCommit: requireEnv('STING_BENCHMARK_COMMIT'),
    recordedAt: process.env.STING_RECORDED_AT || new Date().toISOString(),
    platform: 'ios',
    device: requireEnv('STING_IOS_DEVICE_NAME'),
    deviceId: requireEnv('STING_IOS_DEVICE_ID'),
    osVersion: requireEnv('STING_IOS_OS_VERSION'),
    build: 'release',
    displayRefreshHz: optionalNumberEnv('STING_IOS_REFRESH_HZ'),
    toolchain: {
      xcode: process.env.STING_XCODE_VERSION || 'unknown',
      swift: process.env.STING_SWIFT_VERSION || 'unknown',
    },
  };

  const document = controlCaptureDocument(captures, metadata);
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`${destination}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  runControlCaptureCli().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
