#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResult } from '../benchmarks/results/tool.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredScenarioMetric = [
  ['sparse-10k-row-update', 'native-event-to-native-mutation-latency'],
  ['dense-10k-100-row-update', 'native-event-to-native-mutation-latency'],
];

function fail(message) {
  throw new Error(`final release gate: ${message}`);
}
async function readText(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { fail(`required file missing: ${path} (${error.message})`); }
}
async function collectJsonFiles(directory) {
  const files = [];
  async function visit(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
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
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  fail(`stable release requires a stable SemVer package version, found ${pkg.version}`);
}

const changelog = await readText(join(root, 'CHANGELOG.md'));
const heading = changelog.split(/\r?\n/).find((line) => line.startsWith(`## ${pkg.version}`));
if (!heading) fail(`CHANGELOG.md must contain a ${pkg.version} release section`);
if (/unreleased/i.test(heading)) fail(`CHANGELOG ${pkg.version} section is still marked unreleased`);

for (const path of ['docs/versioning.md', 'docs/upgrading.md', 'docs/releasing.md']) {
  await readText(join(root, path));
}

const decision = await readText(join(root, 'docs/decisions/0004-production-javascript-engine.md'));
if (!/^- Status:\s*accepted\s*$/im.test(decision)) fail('production JavaScript engine ADR must be accepted');
if (!/^- Engine:\s*official QuickJS `2026-06-04`\s*$/im.test(decision)) {
  fail('production JavaScript engine ADR must name official QuickJS 2026-06-04');
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
  if (environment !== 'physical-device' || build !== 'release') fail(`${file} is not release physical-device evidence`);
  if (platform !== 'android') fail(`${file} is release evidence but platform is not android`);
  evidence.push({ file, result });
}

const requiredSystems = [['sting', 'quickjs'], ['react-native', 'hermes']];
for (const [system, engine] of requiredSystems) {
  for (const [scenario, metric] of requiredScenarioMetric) {
    const match = evidence.find(({ result }) =>
      result.metadata.system === system &&
      result.metadata.engine === engine &&
      result.measurement.scenario === scenario &&
      result.measurement.metric === metric,
    );
    if (!match) fail(`missing physical Android evidence: ${system}:${engine}:${scenario}:${metric}`);
  }
}

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
  fail('QuickJS and RN/Hermes evidence must share one Android device/OS/refresh-rate/benchmark-commit cohort');
}

process.stdout.write(`final release gate passed: version=${pkg.version} physicalAndroidEvidenceFiles=${evidenceFiles.length}\n`);
