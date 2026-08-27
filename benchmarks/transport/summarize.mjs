import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_PREFIX = 'STING_TRANSPORT_SAMPLE ';
const EXPECTED_MODES = new Set(['json', 'typed']);
const EXPECTED_ENGINES = new Set(['quickjs', 'quickjs-ng']);

function percentile(sorted, fraction) {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function parseTransportSamples(text, source = '<memory>') {
  const records = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    if (!line.startsWith(SAMPLE_PREFIX)) continue;
    const fields = Object.fromEntries(
      line
        .slice(SAMPLE_PREFIX.length)
        .trim()
        .split(/\s+/)
        .map(part => {
          const equals = part.indexOf('=');
          return equals === -1 ? [part, ''] : [part.slice(0, equals), part.slice(equals + 1)];
        }),
    );

    const engine = fields.engine;
    const scenario = fields.scenario;
    const mode = fields.mode;
    const sample = Number(fields.sample);
    const durationNs = Number(fields.duration_ns);
    const iterations = Number(fields.iterations);
    const checksum = fields.checksum;

    const label = `${source}:${lineIndex + 1}`;
    if (!EXPECTED_ENGINES.has(engine)) throw new Error(`${label}: unknown engine ${engine}`);
    if (!scenario) throw new Error(`${label}: missing scenario`);
    if (!EXPECTED_MODES.has(mode)) throw new Error(`${label}: unknown mode ${mode}`);
    if (!Number.isInteger(sample) || sample < 0) throw new Error(`${label}: invalid sample index`);
    if (!Number.isFinite(durationNs) || durationNs <= 0) throw new Error(`${label}: invalid duration_ns`);
    if (!Number.isInteger(iterations) || iterations <= 0) throw new Error(`${label}: invalid iterations`);
    if (!/^\d+$/.test(checksum ?? '')) throw new Error(`${label}: invalid checksum`);

    records.push({ engine, scenario, mode, sample, durationNs, iterations, checksum });
  }

  if (records.length === 0) throw new Error(`${source}: no ${SAMPLE_PREFIX.trim()} records found`);
  return records;
}

export function summarizeTransportSamples(records, { expectedSamples = 30 } = {}) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.engine}\0${record.scenario}\0${record.mode}`;
    const group = groups.get(key) ?? {
      engine: record.engine,
      scenario: record.scenario,
      mode: record.mode,
      iterations: record.iterations,
      records: [],
    };
    if (group.iterations !== record.iterations) {
      throw new Error(`${record.engine}/${record.scenario}/${record.mode}: iterations changed within sample set`);
    }
    group.records.push(record);
    groups.set(key, group);
  }

  const summaries = [];
  for (const group of groups.values()) {
    group.records.sort((a, b) => a.sample - b.sample);
    if (group.records.length !== expectedSamples) {
      throw new Error(
        `${group.engine}/${group.scenario}/${group.mode}: expected ${expectedSamples} samples, found ${group.records.length}`,
      );
    }
    group.records.forEach((record, index) => {
      if (record.sample !== index) {
        throw new Error(`${group.engine}/${group.scenario}/${group.mode}: expected sample index ${index}, found ${record.sample}`);
      }
    });

    const rawNsPerCall = group.records.map(record => record.durationNs / record.iterations);
    const sorted = [...rawNsPerCall].sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    summaries.push({
      engine: group.engine,
      scenario: group.scenario,
      mode: group.mode,
      iterationsPerSample: group.iterations,
      sampleCount: sorted.length,
      unit: 'ns-per-host-call',
      rawSamples: rawNsPerCall.map(round),
      min: round(sorted[0]),
      mean: round(sum / sorted.length),
      p50: round(percentile(sorted, 0.5)),
      p95: round(percentile(sorted, 0.95)),
      p99: round(percentile(sorted, 0.99)),
      max: round(sorted.at(-1)),
    });
  }

  summaries.sort((a, b) =>
    a.engine.localeCompare(b.engine) ||
    a.scenario.localeCompare(b.scenario) ||
    a.mode.localeCompare(b.mode),
  );

  const comparisons = [];
  const pairKeys = new Set(summaries.map(row => `${row.engine}\0${row.scenario}`));
  for (const key of [...pairKeys].sort()) {
    const [engine, scenario] = key.split('\0');
    const json = summaries.find(row => row.engine === engine && row.scenario === scenario && row.mode === 'json');
    const typed = summaries.find(row => row.engine === engine && row.scenario === scenario && row.mode === 'typed');
    if (!json || !typed) throw new Error(`${engine}/${scenario}: both json and typed modes are required`);
    comparisons.push({
      engine,
      scenario,
      jsonP50NsPerCall: json.p50,
      typedP50NsPerCall: typed.p50,
      jsonToTypedP50Ratio: round(json.p50 / typed.p50),
    });
  }

  return {
    summaryVersion: 1,
    classification: 'diagnostic-host-transport',
    warning:
      'These host measurements compare transport implementations only. They are not physical-device runtime-selection evidence.',
    groups: summaries,
    comparisons,
  };
}

export function summarizeTransportText(text, options) {
  return summarizeTransportSamples(parseTransportSamples(text), options);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    throw new Error('Usage: node benchmarks/transport/summarize.mjs <log-file> [...]');
  }
  let combined = '';
  for (const input of argv) {
    combined += `${await readFile(resolve(input), 'utf8')}\n`;
  }
  process.stdout.write(`${JSON.stringify(summarizeTransportText(combined), null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
