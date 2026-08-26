const CAPTURE_MARKER = 'STING_BENCHMARK_CAPTURE=';

export class BenchmarkCaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BenchmarkCaptureError';
  }
}

function assertInteger(value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new BenchmarkCaptureError(`${path} must be an integer >= ${minimum}`);
  }
}

function assertSamples(value, path) {
  if (!Array.isArray(value)) {
    throw new BenchmarkCaptureError(`${path} must be an array`);
  }
  value.forEach((sample, index) => {
    if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0) {
      throw new BenchmarkCaptureError(`${path}[${index}] must be a finite non-negative number`);
    }
  });
}

export function validateBenchmarkCapture(capture, source = '<capture>') {
  if (capture === null || typeof capture !== 'object' || Array.isArray(capture)) {
    throw new BenchmarkCaptureError(`${source}: capture must be a JSON object`);
  }
  if (capture.captureVersion !== 1) {
    throw new BenchmarkCaptureError(`${source}: captureVersion must equal 1`);
  }
  if (capture.controlRuntime !== 'javascriptcore') {
    throw new BenchmarkCaptureError(`${source}: controlRuntime must equal javascriptcore`);
  }
  for (const key of ['scenario', 'metric', 'unit', 'direction', 'nativeMutationMetric']) {
    if (typeof capture[key] !== 'string' || capture[key].trim().length === 0) {
      throw new BenchmarkCaptureError(`${source}: ${key} must be a non-empty string`);
    }
  }
  if (capture.unit !== 'ms') {
    throw new BenchmarkCaptureError(`${source}: unit must equal ms`);
  }
  if (capture.direction !== 'lower-is-better') {
    throw new BenchmarkCaptureError(`${source}: direction must equal lower-is-better`);
  }

  assertInteger(capture.warmupIterations, `${source}: warmupIterations`, 0);
  assertInteger(capture.sampleCount, `${source}: sampleCount`, 1);
  assertInteger(capture.nativeMutationsPerSample, `${source}: nativeMutationsPerSample`, 0);
  assertInteger(capture.nativeMutationCount, `${source}: nativeMutationCount`, 0);
  assertSamples(capture.samples, `${source}: samples`);
  assertSamples(capture.nativeMutationSamples, `${source}: nativeMutationSamples`);

  if (capture.samples.length !== capture.sampleCount) {
    throw new BenchmarkCaptureError(
      `${source}: sampleCount (${capture.sampleCount}) must equal samples length (${capture.samples.length})`,
    );
  }

  const expectedMutationCount = capture.sampleCount * capture.nativeMutationsPerSample;
  if (capture.nativeMutationCount !== expectedMutationCount) {
    throw new BenchmarkCaptureError(
      `${source}: nativeMutationCount (${capture.nativeMutationCount}) must equal sampleCount * nativeMutationsPerSample (${expectedMutationCount})`,
    );
  }

  if (capture.nativeMutationSamples.length !== capture.nativeMutationCount) {
    throw new BenchmarkCaptureError(
      `${source}: nativeMutationSamples length (${capture.nativeMutationSamples.length}) must equal nativeMutationCount (${capture.nativeMutationCount})`,
    );
  }

  return capture;
}

export function parseBenchmarkCaptures(text, source = '<log>') {
  if (typeof text !== 'string') {
    throw new TypeError('parseBenchmarkCaptures requires a string');
  }

  const captures = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const markerIndex = line.indexOf(CAPTURE_MARKER);
    if (markerIndex < 0) continue;

    const json = line.slice(markerIndex + CAPTURE_MARKER.length).trim();
    let capture;
    try {
      capture = JSON.parse(json);
    } catch (error) {
      throw new BenchmarkCaptureError(
        `${source}:${index + 1}: invalid capture JSON: ${error.message}`,
      );
    }
    captures.push(validateBenchmarkCapture(capture, `${source}:${index + 1}`));
  }

  if (captures.length === 0) {
    throw new BenchmarkCaptureError(`${source}: no ${CAPTURE_MARKER} records found`);
  }

  return captures;
}

export function controlCaptureDocument(captures, metadata = {}) {
  if (!Array.isArray(captures) || captures.length === 0) {
    throw new BenchmarkCaptureError('controlCaptureDocument requires at least one capture');
  }
  captures.forEach((capture, index) => validateBenchmarkCapture(capture, `captures[${index}]`));

  return {
    captureDocumentVersion: 1,
    role: 'semantic-control',
    engine: 'javascriptcore',
    metadata,
    captures,
  };
}
