/*
 * Portable JavaScript-engine probes for StingJS runtime evaluation.
 *
 * Deliberately avoids Node-only APIs so the same source can run in Node,
 * official QuickJS, QuickJS-NG, and Hermes CLI/runtime harnesses.
 * These are explanatory CPU measurements, not the production engine decision.
 */

const SUITE_VERSION = 1;
const WARMUP_RUNS = 5;
const SAMPLE_RUNS = 30;
let sink = 0;

function nowMs() {
  if (
    typeof globalThis.performance === 'object' &&
    globalThis.performance !== null &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function summarize(name, samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  let total = 0;
  for (const value of sorted) total += value;

  return {
    name,
    samples: sorted.length,
    minMs: sorted[0],
    meanMs: total / sorted.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1],
  };
}

function runSync(name, fn) {
  for (let i = 0; i < WARMUP_RUNS; i += 1) sink ^= fn();

  const samples = [];
  for (let i = 0; i < SAMPLE_RUNS; i += 1) {
    const start = nowMs();
    sink ^= fn();
    samples.push(nowMs() - start);
  }
  return summarize(name, samples);
}

async function runAsync(name, fn) {
  for (let i = 0; i < WARMUP_RUNS; i += 1) sink ^= await fn();

  const samples = [];
  for (let i = 0; i < SAMPLE_RUNS; i += 1) {
    const start = nowMs();
    sink ^= await fn();
    samples.push(nowMs() - start);
  }
  return summarize(name, samples);
}

function arithmeticLoop() {
  let value = 1;
  for (let i = 1; i <= 2_000_000; i += 1) {
    value = (value + ((i * 17) ^ (i >>> 3))) | 0;
  }
  return value;
}

function objectAllocation() {
  const items = new Array(50_000);
  let checksum = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = { id: i, active: (i & 1) === 0, value: i * 3, label: `row-${i}` };
    items[i] = item;
    checksum ^= item.value;
  }
  return checksum ^ items.length;
}

function arrayTransform() {
  const values = new Array(100_000);
  for (let i = 0; i < values.length; i += 1) values[i] = i;

  const mapped = values.map((value) => value * 3 + 1);
  const filtered = mapped.filter((value) => (value & 7) === 0);
  let total = 0;
  for (const value of filtered) total = (total + value) | 0;
  return total;
}

function mapSetWorkload() {
  const map = new Map();
  const set = new Set();
  for (let i = 0; i < 50_000; i += 1) {
    map.set(`key-${i}`, i * 2);
    set.add(i % 20_000);
  }

  let checksum = set.size;
  for (let i = 0; i < 50_000; i += 137) checksum ^= map.get(`key-${i}`) ?? 0;
  return checksum;
}

const jsonFixture = JSON.stringify(
  Array.from({ length: 10_000 }, (_, i) => ({
    id: i,
    title: `Item ${i}`,
    enabled: (i & 1) === 0,
    score: i * 0.25,
    tags: [`tag-${i % 11}`, `group-${i % 23}`],
  })),
);

function jsonRoundTrip() {
  const parsed = JSON.parse(jsonFixture);
  const encoded = JSON.stringify(parsed);
  return encoded.length ^ parsed.length;
}

function closures() {
  const functions = new Array(50_000);
  for (let i = 0; i < functions.length; i += 1) {
    const captured = i;
    functions[i] = () => captured * 3 + 1;
  }

  let checksum = 0;
  for (let i = 0; i < functions.length; i += 97) checksum ^= functions[i]();
  return checksum;
}

async function promises() {
  let value = 0;
  for (let i = 0; i < 2_000; i += 1) {
    value = await Promise.resolve(value + 1);
  }
  return value;
}

async function asyncAwaitFanout() {
  const tasks = [];
  for (let i = 0; i < 2_000; i += 1) {
    tasks.push(Promise.resolve(i * 2));
  }
  const values = await Promise.all(tasks);
  let checksum = 0;
  for (let i = 0; i < values.length; i += 1) checksum ^= values[i];
  return checksum;
}

function emit(value) {
  const text = JSON.stringify(value);
  if (typeof globalThis.print === 'function') {
    globalThis.print(text);
  } else if (typeof globalThis.console === 'object' && typeof globalThis.console.log === 'function') {
    globalThis.console.log(text);
  } else {
    throw new Error('No output function is available in this JavaScript runtime');
  }
}

async function main() {
  const results = [
    runSync('arithmetic-loop', arithmeticLoop),
    runSync('object-allocation', objectAllocation),
    runSync('array-transform', arrayTransform),
    runSync('map-set', mapSetWorkload),
    runSync('json-round-trip', jsonRoundTrip),
    runSync('closures', closures),
    await runAsync('promise-chain', promises),
    await runAsync('async-await-fanout', asyncAwaitFanout),
  ];

  emit({
    suite: 'sting-js-engine',
    version: SUITE_VERSION,
    warmupRuns: WARMUP_RUNS,
    sampleRuns: SAMPLE_RUNS,
    results,
    checksum: sink,
  });
}

main().catch((error) => {
  emit({
    suite: 'sting-js-engine',
    version: SUITE_VERSION,
    error: String(error && error.stack ? error.stack : error),
  });
});
