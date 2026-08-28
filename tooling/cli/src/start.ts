import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { basename, resolve } from 'node:path';
import { createStingGoManifest, type StingGoManifest } from './protocol.js';

export interface StartServerOptions {
  projectRoot?: string;
  bundlePath?: string;
  host?: string;
  port?: number;
  projectName?: string;
  runtimeVersion?: string;
  capabilities?: string[];
}

export interface StartedServer {
  server: Server;
  manifest: StingGoManifest;
  manifestUrl: string;
  stingGoUrl: string;
  bundlePath: string;
  close(): Promise<void>;
}

export function findLanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return undefined;
}

function inferProjectName(projectRoot: string): string {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
      if (typeof parsed.name === 'string' && parsed.name.trim()) return parsed.name;
    } catch {
      // Fall back to the directory name. A malformed app package.json will surface elsewhere.
    }
  }
  return basename(projectRoot);
}

export async function startStingServer(options: StartServerOptions = {}): Promise<StartedServer> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const bundlePath = resolve(projectRoot, options.bundlePath ?? 'dist/sting-app.js');
  if (!existsSync(bundlePath)) {
    throw new Error(`Sting bundle not found: ${bundlePath}. Build the project first or pass --bundle <path>.`);
  }

  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8081;
  const manifest = createStingGoManifest({
    projectName: options.projectName ?? inferProjectName(projectRoot),
    runtimeVersion: options.runtimeVersion,
    capabilities: options.capabilities,
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://sting.local');
    if (requestUrl.pathname === '/manifest') {
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(JSON.stringify(manifest));
      return;
    }

    if (requestUrl.pathname === '/bundle') {
      response.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(readFileSync(bundlePath));
      return;
    }

    if (requestUrl.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolveListening();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Sting development server did not expose a TCP address.');
  }

  const advertisedHost = host === '0.0.0.0' ? (findLanAddress() ?? '127.0.0.1') : host;
  const manifestUrl = `http://${advertisedHost}:${address.port}/manifest`;
  const stingGoUrl = `sting://go?url=${encodeURIComponent(manifestUrl)}`;

  return {
    server,
    manifest,
    manifestUrl,
    stingGoUrl,
    bundlePath,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}
