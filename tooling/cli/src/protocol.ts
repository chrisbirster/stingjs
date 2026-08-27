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
  capabilities: string[];
}

export interface CreateManifestOptions {
  projectName: string;
  runtimeVersion?: string;
  capabilities?: string[];
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
    capabilities: [...new Set(options.capabilities ?? [])].sort(),
  };
}
