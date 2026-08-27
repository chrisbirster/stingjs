import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTransportSamples,
  summarizeTransportSamples,
  summarizeTransportText,
} from './summarize.mjs';

function line({
  engine = 'quickjs',
  scenario = 'text-property',
  mode = 'json',
  sample = 0,
  durationNs = 1000,
  iterations = 10,
  checksum = '1',
} = {}) {
  return [
    'STING_TRANSPORT_SAMPLE',
    `engine=${engine}`,
    `scenario=${scenario}`,
    `mode=${mode}`,
    `sample=${sample}`,
    `duration_ns=${durationNs}`,
    `iterations=${iterations}`,
    `checksum=${checksum}`,
  ].join(' ');
}

test('parses transport records and ignores unrelated output', () => {
  const records = parseTransportSamples([
    'build noise',
    line(),
    line({ mode: 'typed', sample: 1, durationNs: 500 }),
  ].join('\n'));

  assert.equal(records.length, 2);
  assert.deepEqual(records[0], {
    engine: 'quickjs',
    scenario: 'text-property',
    mode: 'json',
    sample: 0,
    durationNs: 1000,
    iterations: 10,
    checksum: '1',
  });
});

test('summarizes p50/p95/p99 and json-to-typed ratio', () => {
  const records = [];
  for (const engine of ['quickjs', 'quickjs-ng']) {
    for (const mode of ['json', 'typed']) {
      for (let sample = 0; sample < 3; sample += 1) {
        records.push({
          engine,
          scenario: 'text-property',
          mode,
          sample,
          durationNs: (mode === 'json' ? 200 : 100) * 10 * (sample + 1),
          iterations: 10,
          checksum: String(sample + 1),
        });
      }
    }
  }

  const summary = summarizeTransportSamples(records, { expectedSamples: 3 });
  assert.equal(summary.classification, 'diagnostic-host-transport');
  assert.equal(summary.groups.length, 4);
  assert.equal(summary.comparisons.length, 2);

  const quickjsJson = summary.groups.find(
    row => row.engine === 'quickjs' && row.mode === 'json',
  );
  assert.equal(quickjsJson.p50, 400);
  assert.equal(quickjsJson.p95, 600);
  assert.equal(quickjsJson.p99, 600);

  const comparison = summary.comparisons.find(row => row.engine === 'quickjs');
  assert.equal(comparison.jsonToTypedP50Ratio, 2);
});

test('rejects incomplete mode pairs', () => {
  const records = Array.from({ length: 2 }, (_, sample) => ({
    engine: 'quickjs',
    scenario: 'text-property',
    mode: 'json',
    sample,
    durationNs: 1000 + sample,
    iterations: 10,
    checksum: '1',
  }));

  assert.throws(
    () => summarizeTransportSamples(records, { expectedSamples: 2 }),
    /both json and typed modes are required/,
  );
});

test('rejects malformed sample metadata', () => {
  assert.throws(
    () => summarizeTransportText(
      line({ engine: 'javascriptcore' }),
      { expectedSamples: 1 },
    ),
    /unknown engine javascriptcore/,
  );
});
