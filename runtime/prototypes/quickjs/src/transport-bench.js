const samples = 41;
const iterations = 1000;
const asyncSamples = 21;
const asyncIterations = 100;
const results = [];

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function record(scenario, path, values, count, encodedBytes = null) {
  results.push({
    scenario,
    path,
    iterations: count,
    samples: values.length,
    p50Ns: Math.round(percentile(values, 0.50) * 1000),
    p95Ns: Math.round(percentile(values, 0.95) * 1000),
    p99Ns: Math.round(percentile(values, 0.99) * 1000),
    encodedBytes,
  });
}

function bench(scenario, path, fn, encodedBytes = null) {
  for (let i = 0; i < 100; i += 1) fn(i);
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = __nowMicros();
    for (let i = 0; i < iterations; i += 1) fn(i);
    values.push((__nowMicros() - start) / iterations);
  }
  record(scenario, path, values, iterations, encodedBytes);
}

async function benchAsync(scenario, path, fn, encodedBytes = null) {
  for (let i = 0; i < 10; i += 1) await fn(i);
  const values = [];
  for (let sample = 0; sample < asyncSamples; sample += 1) {
    const start = __nowMicros();
    for (let i = 0; i < asyncIterations; i += 1) await fn(i);
    values.push((__nowMicros() - start) / asyncIterations);
  }
  record(scenario, path, values, asyncIterations, encodedBytes);
}

function jsonPayload(value) {
  return __jsonCall(JSON.stringify(value));
}

(async () => {
  bench('text_property', 'json', () => jsonPayload([1, 'text', 'hello Sting']), JSON.stringify([1, 'text', 'hello Sting']).length);
  bench('text_property', 'typed', () => __typedText(1, 'hello Sting'));

  bench('property_number', 'json', (i) => jsonPayload([1, 'opacity', (i % 100) / 100]), JSON.stringify([1, 'opacity', 0.42]).length);
  bench('property_number', 'typed', (i) => __typedNumber(1, (i % 100) / 100));
  bench('property_string', 'json', () => jsonPayload(['accessibilityLabel', 'benchmark']), JSON.stringify(['accessibilityLabel', 'benchmark']).length);
  bench('property_string', 'typed', () => __typedString('accessibilityLabel', 'benchmark'));
  bench('property_bool', 'json', (i) => jsonPayload([1, 'disabled', (i & 1) === 0]), JSON.stringify([1, 'disabled', true]).length);
  bench('property_bool', 'typed', (i) => __typedBool(1, (i & 1) === 0));

  const style = { padding: 12, opacity: 0.8, cornerRadius: 8, direction: 'row' };
  bench('style_object', 'json-fallback', () => jsonPayload([1, 'style', style]), JSON.stringify([1, 'style', style]).length);

  bench('module_int_string', 'json', () => jsonPayload([42, 'hello']), JSON.stringify([42, 'hello']).length);
  bench('module_int_string', 'typed', () => __typedModule(42, 'hello'));
  const moduleArgs = { path: '/tmp/sting', options: { overwrite: true, atomic: true } };
  bench('module_structured', 'json-fallback', () => jsonPayload(moduleArgs), JSON.stringify(moduleArgs).length);

  await benchAsync('promise_result', 'json', async () => JSON.parse(await Promise.resolve(__jsonResult())).value, __jsonResult().length);
  await benchAsync('promise_result', 'typed', async () => await Promise.resolve(__typedResult()));

  const typedEventHandler = (value, label) => value + label.length;
  const jsonEventHandler = (payload) => {
    const value = JSON.parse(payload);
    return value.value + value.label.length;
  };
  bench('event_stream', 'json', () => __emitJsonEvent(jsonEventHandler), '{"value":42,"label":"tick"}'.length);
  bench('event_stream', 'typed', () => __emitTypedEvent(typedEventHandler));

  print(`STING_TRANSPORT_BENCH ${JSON.stringify({
    schemaVersion: 1,
    engine: 'official-quickjs-2026-06-04',
    runtimeBoundary: 'QuickJS C API -> Zig host callback',
    build: 'ReleaseFast',
    allocationEvidence: {
      allocatorInstrumented: false,
      proxy: 'encodedBytes reports serialized payload size for JSON paths',
    },
    results,
  })}`);
})();
