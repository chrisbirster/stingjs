export const STING_GO_MANIFEST_SCHEMA_VERSION = 1 as const;

export type StingGoClientReportKind =
  | 'connection'
  | 'compatibility'
  | 'bundle'
  | 'runtime'
  | 'reload';

export type StingGoClientPlatform = 'android' | 'ios';

export interface StingGoClientReport {
  kind: StingGoClientReportKind;
  platform: StingGoClientPlatform;
  message: string;
  detail?: string;
}

export interface StingGoManifest {
  schemaVersion: typeof STING_GO_MANIFEST_SCHEMA_VERSION;
  runtimeVersion: string;
  engine: 'quickjs';
  project: {
    name: string;
  };
  bundle: {
    path: '/bundle';
    contentType: 'application/javascript';
  };
  development: {
    reload: {
      path: '/events';
      transport: 'sse';
      contentType: 'text/event-stream';
    };
    health: {
      path: '/health';
      contentType: 'application/json';
    };
    report: {
      path: '/report';
      method: 'POST';
      contentType: 'application/json';
    };
  };
  capabilities: string[];
}

export interface CreateManifestOptions {
  projectName: string;
  runtimeVersion?: string;
  capabilities?: string[];
}

export interface StingGoClientSupport {
  runtimeVersion: string;
  capabilities: readonly string[];
}

export interface StingGoCompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

const REPORT_KINDS = new Set<StingGoClientReportKind>([
  'connection',
  'compatibility',
  'bundle',
  'runtime',
  'reload',
]);
const REPORT_PLATFORMS = new Set<StingGoClientPlatform>(['android', 'ios']);
const MAX_REPORT_MESSAGE_LENGTH = 16_384;
const MAX_REPORT_DETAIL_LENGTH = 32_768;

export function createStingGoManifest(options: CreateManifestOptions): StingGoManifest {
  return {
    schemaVersion: STING_GO_MANIFEST_SCHEMA_VERSION,
    runtimeVersion: options.runtimeVersion ?? '0.1.0',
    engine: 'quickjs',
    project: { name: options.projectName },
    bundle: {
      path: '/bundle',
      contentType: 'application/javascript',
    },
    development: {
      reload: {
        path: '/events',
        transport: 'sse',
        contentType: 'text/event-stream',
      },
      health: {
        path: '/health',
        contentType: 'application/json',
      },
      report: {
        path: '/report',
        method: 'POST',
        contentType: 'application/json',
      },
    },
    capabilities: [...new Set(options.capabilities ?? [])].sort(),
  };
}

export function parseStingGoClientReport(value: unknown): StingGoClientReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Sting Go report must be a JSON object');
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const platform = candidate.platform;
  const message = candidate.message;
  const detail = candidate.detail;

  if (typeof kind !== 'string' || !REPORT_KINDS.has(kind as StingGoClientReportKind)) {
    throw new Error(`Unsupported Sting Go report kind: ${String(kind)}`);
  }
  if (typeof platform !== 'string' || !REPORT_PLATFORMS.has(platform as StingGoClientPlatform)) {
    throw new Error(`Unsupported Sting Go report platform: ${String(platform)}`);
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Sting Go report message must be a non-empty string');
  }
  if (message.length > MAX_REPORT_MESSAGE_LENGTH) {
    throw new Error(`Sting Go report message exceeds ${MAX_REPORT_MESSAGE_LENGTH} characters`);
  }
  if (detail !== undefined && typeof detail !== 'string') {
    throw new Error('Sting Go report detail must be a string when provided');
  }
  if (typeof detail === 'string' && detail.length > MAX_REPORT_DETAIL_LENGTH) {
    throw new Error(`Sting Go report detail exceeds ${MAX_REPORT_DETAIL_LENGTH} characters`);
  }

  return {
    kind: kind as StingGoClientReportKind,
    platform: platform as StingGoClientPlatform,
    message: message.trim(),
    ...(typeof detail === 'string' && detail.length > 0 ? { detail } : {}),
  };
}

export function checkStingGoCompatibility(
  manifest: StingGoManifest,
  client: StingGoClientSupport,
): StingGoCompatibilityResult {
  const reasons: string[] = [];

  if (manifest.schemaVersion !== STING_GO_MANIFEST_SCHEMA_VERSION) {
    reasons.push(
      `Unsupported Sting Go manifest schema ${String(manifest.schemaVersion)}; client supports ${STING_GO_MANIFEST_SCHEMA_VERSION}`,
    );
  }
  if (manifest.engine !== 'quickjs') {
    reasons.push(`Unsupported JavaScript engine ${String(manifest.engine)}; Sting Go requires quickjs`);
  }
  if (manifest.runtimeVersion !== client.runtimeVersion) {
    reasons.push(
      `Runtime version mismatch: project requires ${manifest.runtimeVersion}, client provides ${client.runtimeVersion}`,
    );
  }

  const supportedCapabilities = new Set(client.capabilities);
  const missingCapabilities = manifest.capabilities.filter((capability) => !supportedCapabilities.has(capability));
  if (missingCapabilities.length > 0) {
    reasons.push(`Unsupported Sting capabilities: ${missingCapabilities.sort().join(', ')}`);
  }

  return {
    compatible: reasons.length === 0,
    reasons,
  };
}
