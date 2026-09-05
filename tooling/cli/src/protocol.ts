export const STING_GO_MANIFEST_SCHEMA_VERSION = 1 as const;

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
    },
    capabilities: [...new Set(options.capabilities ?? [])].sort(),
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
