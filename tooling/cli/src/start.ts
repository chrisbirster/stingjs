import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, unwatchFile, watchFile } from 'node:fs';
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
  watchBundle?: boolean;
}

export interface StartedServer {
  server: Server;
  manifest: StingGoManifest;
  manifestUrl: string;
  reloadUrl: string;
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
  const reloadClients = new Set<ServerResponse>();
  let reloadVersion = 0;

  const broadcastReload = (): void => {
    reloadVersion += 1;
    const payload = JSON.stringify({ version: reloadVersion, timestamp: Date.now() });
    for (const response of reloadClients) {
      response.write(`event: reload\ndata: ${payload}\n\n`);
    }
  };

  if (options.watchBundle) {
    watchFile(bundlePath, { interval: 250 }, (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) broadcastReload();
    });
  }

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

    if (requestUrl.pathname === '/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      response.write(`event: ready\ndata: ${JSON.stringify({ version: reloadVersion })}\n\n`);
      reloadClients.add(response);
      request.once('close', () => reloadClients.delete(response));
      return;
    }

    if (requestUrl.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        ok: true,
        watching: options.watchBundle ?? false,
        reloadVersion,
      }));
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
    if (options.watchBundle) unwatchFile(bundlePath);
    throw new Error('Sting development server did not expose a TCP address.');
  }

  const advertisedHost = host === '0.0.0.0' ? (findLanAddress() ?? '127.0.0.1') : host;
  const origin = `http://${advertisedHost}:${address.port}`;
  const manifestUrl = `${origin}/manifest`;
  const reloadUrl = `${origin}/events`;
  const stingGoUrl = `sting://go?url=${encodeURIComponent(manifestUrl)}`;

  return {
    server,
    manifest,
    manifestUrl,
    reloadUrl,
    stingGoUrl,
    bundlePath,
    close: () => new Promise<void>((resolveClose, reject) => {
      if (options.watchBundle) unwatchFile(bundlePath);
      for (const response of reloadClients) response.end();
      reloadClients.clear();
      server.close((error) => error ? reject(error) : resolveClose());
    }),
  };
}
