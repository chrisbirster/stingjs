import { validateResult } from './tool.mjs';

export class CandidateCaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CandidateCaptureError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CandidateCaptureError(`${path} must be a non-empty string`);
  }
  return value;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'value';
}

export function validateCandidateCaptureDocument(document, source = '<capture>') {
  if (!isPlainObject(document)) {
    throw new CandidateCaptureError(`${source}: capture document must be an object`);
  }
  if (document.captureDocumentVersion !== 1) {
    throw new CandidateCaptureError(`${source}: captureDocumentVersion must equal 1`);
  }
  if (document.role !== 'decision-evidence') {
    throw new CandidateCaptureError(`${source}: role must equal decision-evidence`);
  }
  if (!isPlainObject(document.metadata)) {
    throw new CandidateCaptureError(`${source}: metadata must be an object`);
  }
  if (!Array.isArray(document.captures) || document.captures.length === 0) {
    throw new CandidateCaptureError(`${source}: captures must be a non-empty array`);
  }

  const metadata = document.metadata;
  requireNonEmptyString(metadata.benchmarkCommit, `${source}: metadata.benchmarkCommit`);
  requireNonEmptyString(metadata.recordedAt, `${source}: metadata.recordedAt`);
  requireNonEmptyString(metadata.platform, `${source}: metadata.platform`);
  requireNonEmptyString(metadata.environment, `${source}: metadata.environment`);
  requireNonEmptyString(metadata.device, `${source}: metadata.device`);
  requireNonEmptyString(metadata.osVersion, `${source}: metadata.osVersion`);
  requireNonEmptyString(metadata.build, `${source}: metadata.build`);
  requireNonEmptyString(metadata.system, `${source}: metadata.system`);
  requireNonEmptyString(metadata.engine, `${source}: metadata.engine`);
  requireNonEmptyString(metadata.engineVersion, `${source}: metadata.engineVersion`);
  requireNonEmptyString(metadata.frameworkVersion, `${source}: metadata.frameworkVersion`);

  if (metadata.environment !== 'physical-device') {
    throw new CandidateCaptureError(
      `${source}: candidate evidence must come from environment=physical-device`,
    );
  }
  if (metadata.build !== 'release') {
    throw new CandidateCaptureError(`${source}: candidate evidence must use build=release`);
  }
  if (metadata.engine === 'javascriptcore') {
    throw new CandidateCaptureError(
      `${source}: JavaScriptCore is semantic-control only and cannot become decision evidence`,
    );
  }
  if (metadata.system === 'react-native' && metadata.engine !== 'hermes') {
    throw new CandidateCaptureError(
      `${source}: React Native decision evidence must use Hermes`,
    );
  }

  return document;
}

export function candidateCaptureToEvidence(document, source = '<capture>') {
  validateCandidateCaptureDocument(document, source);

  const seenFilenames = new Set();
  return document.captures.map((measurement, index) => {
    if (!isPlainObject(measurement)) {
      throw new CandidateCaptureError(`${source}: captures[${index}] must be an object`);
    }
    if (!Array.isArray(measurement.samples) || measurement.samples.length === 0) {
      throw new CandidateCaptureError(
        `${source}: captures[${index}].samples must be a non-empty array`,
      );
    }

    const result = {
      schemaVersion: 1,
      metadata: {
        ...document.metadata,
        sampleCount: measurement.samples.length,
      },
      measurement: {
        ...measurement,
      },
    };

    validateResult(result, `${source}:captures[${index}]`);

    const filename = [
      result.metadata.system,
      result.metadata.engine,
      result.metadata.platform,
      slug(result.measurement.scenario),
      slug(result.measurement.metric),
    ].join('-') + '.json';

    if (seenFilenames.has(filename)) {
      throw new CandidateCaptureError(
        `${source}: multiple captures map to the same evidence filename ${filename}`,
      );
    }
    seenFilenames.add(filename);

    return { filename, result };
  });
}
