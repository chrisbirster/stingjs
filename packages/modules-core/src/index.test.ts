import { afterEach, describe, expect, it } from 'vitest';
import {
  installNativeBridge,
  resetNativeBridgeForTests,
  STING_PROTOCOL_VERSION,
  type StingNativeBridge,
} from '@stingjs/core';
import { createNativeModule, requireNativeModule } from './index.js';

class RecordingBridge implements StingNativeBridge {
  calls: Array<{ module: string; method: string; argsJSON: string }> = [];
  asyncCalls: Array<{ module: string; method: string; argsJSON: string; requestId: number }> = [];
  eventTransitions: Array<{ module: string; event: string; enabled: boolean }> = [];

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'android',
      modules: { Clipboard: '0.1.0' },
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
    this.calls.push({ module, method, argsJSON });
    const value = method === '__sting_permission_status'
      ? 'granted'
      : method === 'hasString';
    return JSON.stringify({ ok: true, value });
  }

  callModuleAsync(module: string, method: string, argsJSON: string, requestId: number): void {
    this.asyncCalls.push({ module, method, argsJSON, requestId });
  }

  setModuleEventEnabled(module: string, event: string, enabled: boolean): string {
    this.eventTransitions.push({ module, event, enabled });
    return JSON.stringify({ ok: true, value: null });
  }
}

afterEach(() => {
  resetNativeBridgeForTests();
  globalThis.__stingNativeBridge = undefined;
});

describe('native module client', () => {
  it('routes typed synchronous calls through the active Sting host', () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    const clipboard = createNativeModule('Clipboard');
    expect(clipboard.isAvailable()).toBe(true);
    expect(clipboard.version()).toBe('0.1.0');
    expect(clipboard.callSync<boolean>('hasString')).toBe(true);
    expect(bridge.calls).toEqual([
      { module: 'Clipboard', method: 'hasString', argsJSON: '[]' },
    ]);
  });

  it('routes typed asynchronous calls through the active Sting host and resolves later', async () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    const clipboard = createNativeModule('Clipboard');
    const pending = clipboard.callAsync<{ text: string }>('readLater', ['source']);

    expect(bridge.asyncCalls).toHaveLength(1);
    expect(bridge.asyncCalls[0]).toMatchObject({
      module: 'Clipboard',
      method: 'readLater',
      argsJSON: '["source"]',
    });

    const requestId = bridge.asyncCalls[0]!.requestId;
    expect(globalThis.__stingResolveModuleCall?.(
      requestId,
      JSON.stringify({ ok: true, value: { text: 'native' } }),
    )).toBe(true);

    await expect(pending).resolves.toEqual({ text: 'native' });
  });

  it('uses reserved sync and async operations for portable permission status/request', async () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    const clipboard = createNativeModule('Clipboard');
    expect(clipboard.permissionStatus(' camera ')).toBe('granted');
    expect(bridge.calls.at(-1)).toEqual({
      module: 'Clipboard',
      method: '__sting_permission_status',
      argsJSON: '["camera"]',
    });

    const pending = clipboard.requestPermission('camera');
    expect(bridge.asyncCalls.at(-1)).toMatchObject({
      module: 'Clipboard',
      method: '__sting_permission_request',
      argsJSON: '["camera"]',
    });
    const requestId = bridge.asyncCalls.at(-1)!.requestId;
    expect(globalThis.__stingResolveModuleCall?.(
      requestId,
      JSON.stringify({ ok: true, value: 'limited' }),
    )).toBe(true);
    await expect(pending).resolves.toBe('limited');
  });

  it('validates permission names and rejects invalid native status values', () => {
    const bridge = new RecordingBridge();
    bridge.callModuleSync = (module, method, argsJSON) => {
      bridge.calls.push({ module, method, argsJSON });
      return JSON.stringify({ ok: true, value: 'platform-specific-status' });
    };
    installNativeBridge(bridge);

    const clipboard = createNativeModule('Clipboard');
    expect(() => clipboard.permissionStatus('   ')).toThrow(
      'Native permission name must not be empty',
    );
    expect(() => clipboard.permissionStatus('camera')).toThrow(
      'returned an invalid status for permission camera',
    );
  });

  it('routes typed native event subscriptions and returns an idempotent removable handle', () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    const clipboard = createNativeModule('Clipboard');
    const payloads: Array<{ text: string }> = [];
    const subscription = clipboard.addListener<{ text: string }>('change', payload => {
      payloads.push(payload);
    });

    expect(bridge.eventTransitions).toEqual([
      { module: 'Clipboard', event: 'change', enabled: true },
    ]);
    expect(globalThis.__stingDispatchModuleEvent?.(
      'Clipboard',
      'change',
      JSON.stringify({ text: 'native' }),
    )).toBe(true);
    expect(payloads).toEqual([{ text: 'native' }]);

    subscription.remove();
    subscription.remove();

    expect(bridge.eventTransitions).toEqual([
      { module: 'Clipboard', event: 'change', enabled: true },
      { module: 'Clipboard', event: 'change', enabled: false },
    ]);
  });

  it('fails clearly when a required module is absent', () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    expect(() => requireNativeModule('Camera')).toThrow(
      'Native module Camera is not installed in this Sting host.',
    );
  });
});
