import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { get, type IncomingMessage } from 'node:http';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startStingServer } from './start.js';

function openEventStream(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Unexpected SSE status ${response.statusCode}`));
        return;
      }
      response.setEncoding('utf8');
      resolve(response);
    });
    request.once('error', reject);
  });
}

function waitForEvent(response: IncomingMessage, eventName: string, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for SSE event ${eventName}`));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      response.off('data', onData);
      response.off('error', onError);
      response.off('end', onEnd);
    };
    const onData = (chunk: string): void => {
      body += chunk;
      if (body.includes(`event: ${eventName}\n`)) {
        cleanup();
        resolve(body);
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onEnd = (): void => {
      cleanup();
      reject(new Error(`SSE stream ended before event ${eventName}`));
    };

    response.on('data', onData);
    response.once('error', onError);
    response.once('end', onEnd);
  });
}

test('watch mode emits reload events, reports state, and reconnects at the latest version', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sting-cli-reload-'));
  const dist = join(root, 'dist');
  const bundlePath = join(dist, 'sting-app.js');
  mkdirSync(dist);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@example/reload' }));
  writeFileSync(bundlePath, 'globalThis.__version = 0;');

  const started = await startStingServer({
    projectRoot: root,
    host: '127.0.0.1',
    port: 0,
    watchBundle: true,
  });

  let events: IncomingMessage | undefined;
  let reconnect: IncomingMessage | undefined;
  try {
    events = await openEventStream(started.reloadUrl);
    const ready = await waitForEvent(events, 'ready');
    assert.match(ready, /"version":0/);

    const reloadPromise = waitForEvent(events, 'reload');
    writeFileSync(bundlePath, 'globalThis.__version = 1;');
    const reload = await reloadPromise;
    assert.match(reload, /"version":[1-9][0-9]*/);

    const healthResponse = await fetch(new URL('/health', started.manifestUrl));
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json() as { ok: boolean; watching: boolean; reloadVersion: number };
    assert.equal(health.ok, true);
    assert.equal(health.watching, true);
    assert.ok(health.reloadVersion >= 1);

    events.destroy();
    events = undefined;

    reconnect = await openEventStream(started.reloadUrl);
    const reconnectedReady = await waitForEvent(reconnect, 'ready');
    assert.match(reconnectedReady, /"version":[1-9][0-9]*/);
  } finally {
    events?.destroy();
    reconnect?.destroy();
    await started.close();
  }
});
