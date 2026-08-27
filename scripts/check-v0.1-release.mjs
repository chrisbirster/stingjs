#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateResult } from '../benchmarks/results/tool.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const expectedVersion = '0.1.0';
const requiredScenarioMetric = [
  ['sparse-10k-row-update', 'native-event-to-native-mutation-latency'],
  ['dense-10k-100-row-update', 'native-event-to-native-mutation-latency'],
];

function fail(message) {
  throw new Error(`v0.1 release gate: ${message}`);
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    fail(`required file missing: ${path} (${error.message})`);
  }
}

async function collectJsonFiles(directory) {
  const files = [];
  async function visit(path) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(child);
    }
  }
  await visit(directory);
  return files.sort();
}

const pkg = JSON.parse(await readText(join(root, 'package.json')));
if (pkg.version !== expectedVersion) {
  fail(`package.json version must be ${expectedVersion}, found ${pkg.version}`);
}

const changelog = await readText(join(root, 'CHANGELOG.md'));
if (!changelog.includes('## 0.1.0')) {
  fail('CHANGELOG.md must contain a 0.1.0 release section');
}

const decisionPath = join(root, 'docs/decisions/0004-production-javascript-engine.md');
const decision = await readText(decisionPath);
if (!/^- Status:\s*accepted\s*$/im.test(decision)) {
  fail('production JavaScript engine ADR must be accepted before release');
}
const engineMatch = decision.match(/^- Engine:\s*(quickjs|quickjs-ng)\s*$/im);
if (!engineMatch) {
  fail('production JavaScript engine ADR must name Engine: quickjs or quickjs-ng');
}

const evidenceFiles = await collectJsonFiles(join(root, 'benchmarks/results/raw'));
if (evidenceFiles.length === 0) {
  fail('no checked-in physical-device evidence exists under benchmarks/results/raw');
}

const evidence = [];
for (const file of evidenceFiles) {
  const result = JSON.parse(await readText(file));
  validateResult(result, file);
  const { platform, environment, build } = result.metadata;
  if (environment !== 'physical-device' || build !== 'release') {
    fail(`${file} is not release physical-device evidence`);
  }
  if (platform !== 'android') {
    fail(`${file} is checked-in v0.1 decision evidence but platform is not android`);
  }
  evidence.push({ file, result });
}

const requiredSystems = [
  ['sting', 'quickjs'],
  ['sting', 'quickjs-ng'],
  ['react-native', 'hermes'],
];

for (const [system, engine] of requiredSystems) {
  for (const [scenario, metric] of requiredScenarioMetric) {
    const match = evidence.find(({ result }) =>
      result.metadata.system === system &&
      result.metadata.engine === engine &&
      result.measurement.scenario === scenario &&
      result.measurement.metric === metric,
    );
    if (!match) {
      fail(`missing physical Android evidence: ${system}:${engine}:${scenario}:${metric}`);
    }
  }
}

// The production comparison is only meaningful when all three systems were
// measured as one cohort: exact repository commit, same physical phone, same
// OS, architecture, and active display refresh rate.
const cohortKeys = new Set(
  evidence
    .filter(({ result }) => requiredSystems.some(([system, engine]) =>
      result.metadata.system === system && result.metadata.engine === engine,
    ))
    .map(({ result }) => JSON.stringify({
      benchmarkCommit: result.metadata.benchmarkCommit,
      device: result.metadata.device,
      deviceArchitecture: result.metadata.deviceArchitecture ?? null,
      osVersion: result.metadata.osVersion,
      displayRefreshHz: result.metadata.displayRefreshHz,
    })),
);
if (cohortKeys.size !== 1) {
  fail('QuickJS, QuickJS-NG, and RN/Hermes evidence must share one Android device/OS/refresh-rate/benchmark-commit cohort');
}

process.stdout.write(
  `v0.1 release gate passed: engine=${engineMatch[1]} physicalAndroidEvidenceFiles=${evidenceFiles.length}\n`,
);
