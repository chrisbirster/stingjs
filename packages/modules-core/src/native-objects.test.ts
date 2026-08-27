import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installNativeBridge,
  resetNativeBridgeForTests,
  STING_PROTOCOL_VERSION,
  StingNativeError,
  type StingNativeBridge,
} from '@stingjs/core';
import { createNativeModule } from './index.js';

class ObjectBridge implements StingNativeBridge {
  syncCalls: Array<{ module: string; method: string; argsJSON: string }> = [];
  asyncCalls: Array<{ module: string; method: string; argsJSON: string; requestId: number }> = [];
  nextHandle: unknown = 17;
  failObjectCalls = false;

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'android',
      modules: { Audio: '0.1.0' },
    });
  }

  createElement(): void {}
  createTextNode(): void {}
  replaceText(): void {}
  setProperty(): void {}
  insertNode(): void {}
  removeNode(): void {}
  setEventEnabled(): void {}

  callModuleSync(module: string, method: string, argsJSON: string): string {
    this.syncCalls.push({ module, method, argsJSON });

    if (this.failObjectCalls && method === '__sting_object_call_sync') {
      return JSON.stringify({
        ok: false,
        error: {
          code: 'E_OBJECT_NOT_FOUND',
          message: 'Native object handle is stale',
          module,
          method,
          details: { handle: 17 },
        },
      });
    }

    if (method === '__sting_object_create') {
      return JSON.stringify({ ok: true, value: this.nextHandle });
    }
    if (method === '__sting_object_call_sync') {
      return JSON.stringify({ ok: true, value: { position: 42 } });
    }
    return JSON.stringify({ ok: true, value: null });
  }

  callModuleAsync(module: string, method: string, argsJSON: string, requestId: number): void {
    this.asyncCalls.push({ module, method, argsJSON, requestId });
  }
}

afterEach(() => {
  resetNativeBridgeForTests();
  globalThis.__stingNativeBridge = undefined;
});

describe('native module objects', () => {
  it('creates an opaque object and routes sync and async methods through reserved transport operations', async () => {
    const bridge = new ObjectBridge();
    installNativeBridge(bridge);
    const audio = createNativeModule('Audio');

    const player = audio.createObject('Player', ['song.mp3']);
    expect(player.module).toBe('Audio');
    expect(player.type).toBe('Player');
    expect(player.disposed).toBe(false);
    expect(bridge.syncCalls[0]).toEqual({
      module: 'Audio',
      method: '__sting_object_create',
      argsJSON: '["Player","song.mp3"]',
    });

    expect(player.callSync<{ position: number }>('status')).toEqual({ position: 42 });
    expect(bridge.syncCalls[1]).toEqual({
      module: 'Audio',
      method: '__sting_object_call_sync',
      argsJSON: '[17,"status"]',
    });

    const pending = player.callAsync<string>('prepare', [3]);
    expect(bridge.asyncCalls).toHaveLength(1);
    expect(bridge.asyncCalls[0]).toMatchObject({
      module: 'Audio',
      method: '__sting_object_call_async',
      argsJSON: '[17,"prepare",3]',
    });

    expect(globalThis.__stingResolveModuleCall?.(
      bridge.asyncCalls[0]!.requestId,
      JSON.stringify({ ok: true, value: 'ready' }),
    )).toBe(true);
    await expect(pending).resolves.toBe('ready');

    player.dispose();
    player.dispose();
    expect(player.disposed).toBe(true);
    expect(bridge.syncCalls.filter(call => call.method === '__sting_object_dispose')).toEqual([
      { module: 'Audio', method: '__sting_object_dispose', argsJSON: '[17]' },
    ]);
  });

  it('retires live object wrappers during runtime disposal and releases each handle exactly once', () => {
    const bridge = new ObjectBridge();
    installNativeBridge(bridge);
    const audio = createNativeModule('Audio');
    const first = audio.createObject('Player');
    bridge.nextHandle = 18;
    const second = audio.createObject('Player');

    first.dispose();
    globalThis.__stingDisposeRuntime?.();

    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(bridge.syncCalls.filter(call => call.method === '__sting_object_dispose')).toEqual([
      { module: 'Audio', method: '__sting_object_dispose', argsJSON: '[17]' },
      { module: 'Audio', method: '__sting_object_dispose', argsJSON: '[18]' },
    ]);

    expect(() => second.callSync('status')).toThrowError(
      expect.objectContaining({ code: 'E_OBJECT_DISPOSED', method: 'status' }),
    );
  });

  it('remaps native object transport errors to the public object method name', () => {
    const bridge = new ObjectBridge();
    installNativeBridge(bridge);
    const player = createNativeModule('Audio').createObject('Player');
    bridge.failObjectCalls = true;

    try {
      player.callSync('status');
      throw new Error('expected native object call to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(StingNativeError);
      expect(error).toMatchObject({
        code: 'E_OBJECT_NOT_FOUND',
        module: 'Audio',
        method: 'status',
        details: { handle: 17 },
      });
    }
  });

  it('rejects invalid native handles before constructing a public object wrapper', () => {
    const bridge = new ObjectBridge();
    bridge.nextHandle = 'not-a-handle';
    installNativeBridge(bridge);

    expect(() => createNativeModule('Audio').createObject('Player')).toThrowError(
      expect.objectContaining({ code: 'E_INVALID_OBJECT_HANDLE' }),
    );
  });
});
