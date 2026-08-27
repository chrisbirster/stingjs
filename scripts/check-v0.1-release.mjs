#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateResult } from '../benchmarks/results/tool.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const expectedVersion = '0.1.0';

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
const engineMatch = decision.match(/^- Engine:\s*(quickjs|quickjs-ng|hermes)\s*$/im);
if (!engineMatch) {
  fail('production JavaScript engine ADR must name Engine: quickjs, quickjs-ng, or hermes');
}

const evidenceFiles = await collectJsonFiles(join(root, 'benchmarks/results/raw'));
if (evidenceFiles.length === 0) {
  fail('no checked-in physical-device evidence exists under benchmarks/results/raw');
}

const coverage = new Set();
for (const file of evidenceFiles) {
  const result = JSON.parse(await readText(file));
  validateResult(result, file);
  const { platform, system, engine, environment, build } = result.metadata;
  if (environment !== 'physical-device' || build !== 'release') {
    fail(`${file} is not release physical-device evidence`);
  }
  coverage.add(`${platform}:${system}:${engine}`);
}

// Hermes V1 was semantically disqualified as a Sting candidate in the pinned
// conformance train, but remains the external React Native baseline. Both
// surviving QuickJS-family candidates must therefore have physical evidence on
// both platforms before one is selected.
const requiredCoverage = [
  'ios:sting:quickjs',
  'android:sting:quickjs',
  'ios:sting:quickjs-ng',
  'android:sting:quickjs-ng',
  'ios:react-native:hermes',
  'android:react-native:hermes',
];
for (const key of requiredCoverage) {
  if (!coverage.has(key)) fail(`missing physical evidence coverage: ${key}`);
}

process.stdout.write(
  `v0.1 release gate passed: engine=${engineMatch[1]} evidenceFiles=${evidenceFiles.length}\n`,
);
