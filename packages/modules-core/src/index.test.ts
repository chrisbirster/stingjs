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
    return JSON.stringify({ ok: true, value: method === 'hasString' });
  }
}

afterEach(() => {
  resetNativeBridgeForTests();
  globalThis.__stingNativeBridge = undefined;
});

describe('native module client', () => {
  it('routes typed calls through the active Sting host', () => {
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

  it('fails clearly when a required module is absent', () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);

    expect(() => requireNativeModule('Camera')).toThrow(
      'Native module Camera is not installed in this Sting host.',
    );
  });
});
