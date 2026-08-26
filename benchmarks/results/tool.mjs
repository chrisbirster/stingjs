import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORMS = new Set(['ios', 'android']);
const SYSTEMS = new Set(['sting', 'react-native']);
const ENGINES = new Set(['quickjs', 'quickjs-ng', 'hermes']);
const UNITS = new Set(['ms', 'bytes', 'count', 'fps', 'percent']);
const DIRECTIONS = new Set(['lower-is-better', 'higher-is-better', 'neutral']);
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'metadata', 'measurement']);
const METADATA_REQUIRED_KEYS = new Set([
  'benchmarkCommit',
  'recordedAt',
  'platform',
  'device',
  'osVersion',
  'build',
  'system',
  'engine',
  'engineVersion',
  'frameworkVersion',
  'displayRefreshHz',
  'sampleCount',
]);
const METADATA_OPTIONAL_KEYS = new Set(['deviceArchitecture', 'toolchain', 'notes']);
const MEASUREMENT_REQUIRED_KEYS = new Set([
  'scenario',
  'metric',
  'unit',
  'direction',
  'samples',
]);
const MEASUREMENT_OPTIONAL_KEYS = new Set(['tags', 'notes']);

export class EvidenceValidationError extends Error {
  constructor(source, errors) {
    super(`${source}:\n${errors.map(error => `  - ${error}`).join('\n')}`);
    this.name = 'EvidenceValidationError';
    this.source = source;
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKeys(value, required, optional, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${path}.${key} is required`);
    }
  }

  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not allowed by schema v1`);
    }
  }
}

function assertNonEmptyString(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function assertEnum(value, allowed, path, errors) {
  if (!allowed.has(value)) {
    errors.push(`${path} must be one of: ${[...allowed].join(', ')}`);
  }
}

function validatePrimitiveMap(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry !== 'string' &&
      typeof entry !== 'boolean' &&
      !(typeof entry === 'number' && Number.isFinite(entry))
    ) {
      errors.push(`${path}.${key} must be a string, finite number, or boolean`);
    }
  }
}

function validateStringMap(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      errors.push(`${path}.${key} must be a string`);
    }
  }
}

export function validateResult(result, source = '<memory>') {
  const errors = [];

  if (!isPlainObject(result)) {
    throw new EvidenceValidationError(source, ['result must be a JSON object']);
  }

  assertKeys(result, TOP_LEVEL_KEYS, new Set(), 'result', errors);

  if (result.schemaVersion !== 1) {
    errors.push('result.schemaVersion must equal 1');
  }

  if (!isPlainObject(result.metadata)) {
    errors.push('result.metadata must be an object');
  } else {
    const metadata = result.metadata;
    assertKeys(
      metadata,
      METADATA_REQUIRED_KEYS,
      METADATA_OPTIONAL_KEYS,
      'result.metadata',
      errors,
    );

    if (
      typeof metadata.benchmarkCommit !== 'string' ||
      !/^[0-9a-fA-F]{40}$/.test(metadata.benchmarkCommit)
    ) {
      errors.push('result.metadata.benchmarkCommit must be a full 40-character Git SHA');
    }

    if (
      typeof metadata.recordedAt !== 'string' ||
      !ISO_DATE_TIME.test(metadata.recordedAt) ||
      Number.isNaN(Date.parse(metadata.recordedAt))
    ) {
      errors.push('result.metadata.recordedAt must be a valid ISO-8601 date-time string');
    }

    assertEnum(metadata.platform, PLATFORMS, 'result.metadata.platform', errors);
    assertNonEmptyString(metadata.device, 'result.metadata.device', errors);
    assertNonEmptyString(metadata.osVersion, 'result.metadata.osVersion', errors);

    if (metadata.build !== 'release') {
      errors.push('result.metadata.build must equal "release" for checked-in evidence');
    }

    assertEnum(metadata.system, SYSTEMS, 'result.metadata.system', errors);
    assertEnum(metadata.engine, ENGINES, 'result.metadata.engine', errors);
    assertNonEmptyString(metadata.engineVersion, 'result.metadata.engineVersion', errors);
    assertNonEmptyString(
      metadata.frameworkVersion,
      'result.metadata.frameworkVersion',
      errors,
    );

    if (
      typeof metadata.displayRefreshHz !== 'number' ||
      !Number.isFinite(metadata.displayRefreshHz) ||
      metadata.displayRefreshHz <= 0
    ) {
      errors.push('result.metadata.displayRefreshHz must be a finite number greater than 0');
    }

    if (!Number.isInteger(metadata.sampleCount) || metadata.sampleCount < 1) {
      errors.push('result.metadata.sampleCount must be an integer greater than 0');
    }

    if (
      metadata.system === 'react-native' &&
      metadata.engine !== undefined &&
      metadata.engine !== 'hermes'
    ) {
      errors.push('React Native baseline evidence must use the Hermes engine');
    }

    if (Object.hasOwn(metadata, 'deviceArchitecture')) {
      assertNonEmptyString(
        metadata.deviceArchitecture,
        'result.metadata.deviceArchitecture',
        errors,
      );
    }

    if (Object.hasOwn(metadata, 'toolchain')) {
      validatePrimitiveMap(metadata.toolchain, 'result.metadata.toolchain', errors);
    }

    if (Object.hasOwn(metadata, 'notes') && typeof metadata.notes !== 'string') {
      errors.push('result.metadata.notes must be a string');
    }
  }

  if (!isPlainObject(result.measurement)) {
    errors.push('result.measurement must be an object');
  } else {
    const measurement = result.measurement;
    assertKeys(
      measurement,
      MEASUREMENT_REQUIRED_KEYS,
      MEASUREMENT_OPTIONAL_KEYS,
      'result.measurement',
      errors,
    );

    assertNonEmptyString(measurement.scenario, 'result.measurement.scenario', errors);
    assertNonEmptyString(measurement.metric, 'result.measurement.metric', errors);
    assertEnum(measurement.unit, UNITS, 'result.measurement.unit', errors);
    assertEnum(measurement.direction, DIRECTIONS, 'result.measurement.direction', errors);

    if (!Array.isArray(measurement.samples) || measurement.samples.length === 0) {
      errors.push('result.measurement.samples must be a non-empty array');
    } else {
      measurement.samples.forEach((sample, index) => {
        if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0) {
          errors.push(`result.measurement.samples[${index}] must be a finite non-negative number`);
        }
      });

      if (
        isPlainObject(result.metadata) &&
        Number.isInteger(result.metadata.sampleCount) &&
        result.metadata.sampleCount !== measurement.samples.length
      ) {
        errors.push(
          `result.metadata.sampleCount (${result.metadata.sampleCount}) must equal raw sample length (${measurement.samples.length})`,
        );
      }
    }

    if (Object.hasOwn(measurement, 'tags')) {
      validateStringMap(measurement.tags, 'result.measurement.tags', errors);
    }

    if (Object.hasOwn(measurement, 'notes') && typeof measurement.notes !== 'string') {
      errors.push('result.measurement.notes must be a string');
    }
  }

  if (errors.length > 0) {
    throw new EvidenceValidationError(source, errors);
  }

  return result;
}

export function percentile(sortedSamples, percentileValue) {
  if (!Array.isArray(sortedSamples) || sortedSamples.length === 0) {
    throw new TypeError('percentile requires at least one sorted sample');
  }
  if (percentileValue <= 0 || percentileValue > 1) {
    throw new RangeError('percentile value must be in the range (0, 1]');
  }

  const index = Math.max(0, Math.ceil(percentileValue * sortedSamples.length) - 1);
  return sortedSamples[index];
}

export function summarizeResult(result, source = '<memory>') {
  validateResult(result, source);

  const samples = [...result.measurement.samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, sample) => total + sample, 0);
  const summary = {
    source,
    metadata: result.metadata,
    measurement: {
      scenario: result.measurement.scenario,
      metric: result.measurement.metric,
      unit: result.measurement.unit,
      direction: result.measurement.direction,
      sampleCount: samples.length,
      min: samples[0],
      mean: sum / samples.length,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
      max: samples[samples.length - 1],
    },
  };

  if (result.measurement.unit === 'ms') {
    const frameBudgetMs = 1000 / result.metadata.displayRefreshHz;
    const frameBudgetMissCount = samples.filter(sample => sample > frameBudgetMs).length;
    summary.measurement.frameBudgetMs = frameBudgetMs;
    summary.measurement.frameBudgetMissCount = frameBudgetMissCount;
    summary.measurement.frameBudgetMissPercent =
      (frameBudgetMissCount / samples.length) * 100;
  }

  return summary;
}

async function collectJsonFiles(inputs) {
  const files = [];

  async function visit(input) {
    const absolute = resolve(input);
    const info = await stat(absolute);

    if (info.isDirectory()) {
      const entries = await readdir(absolute, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        await visit(resolve(absolute, entry.name));
      }
      return;
    }

    if (info.isFile() && absolute.endsWith('.json') && basename(absolute) !== 'schema-v1.json') {
      files.push(absolute);
    }
  }

  for (const input of inputs) {
    await visit(input);
  }

  return [...new Set(files)].sort();
}

async function readResult(path) {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new EvidenceValidationError(path, [`invalid JSON: ${error.message}`]);
  }
}

function displayPath(path) {
  const value = relative(process.cwd(), path);
  return (value || '.').split('\\').join('/');
}

function usage() {
  return [
    'Usage:',
    '  node benchmarks/results/tool.mjs validate <file-or-directory> [...]',
    '  node benchmarks/results/tool.mjs summarize <file-or-directory> [...]',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...inputs] = argv;

  if (!['validate', 'summarize'].includes(command) || inputs.length === 0) {
    throw new Error(usage());
  }

  const files = await collectJsonFiles(inputs);
  if (files.length === 0) {
    throw new Error('No evidence JSON files found in the supplied inputs.');
  }

  const results = [];
  for (const file of files) {
    const source = displayPath(file);
    const result = await readResult(file);
    validateResult(result, source);
    results.push({ source, result });
  }

  if (command === 'validate') {
    process.stdout.write(`${results.length} evidence file(s) valid\n`);
    return;
  }

  const output = {
    summaryVersion: 1,
    sourceCount: results.length,
    results: results.map(({ source, result }) => summarizeResult(result, source)),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  runCli().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
