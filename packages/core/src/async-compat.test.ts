import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STING_PROTOCOL_VERSION,
  StingHost,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from './index.js';

function makeSyncOnlyBridge(): StingNativeBridge {
  return {
    getRuntimeInfo: vi.fn(() => JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'android',
      modules: { LegacySync: '0.1.0' },
    })),
    createElement: vi.fn(),
    createTextNode: vi.fn(),
    replaceText: vi.fn(),
    setProperty: vi.fn(),
    insertNode: vi.fn(),
    removeNode: vi.fn(),
    setEventEnabled: vi.fn(),
    callModuleSync: vi.fn(() => JSON.stringify({ ok: true, value: 'sync-result' })),
  };
}

afterEach(() => resetNativeBridgeForTests());

describe('async module bridge compatibility', () => {
  it('keeps protocol-v1 sync-only hosts valid and never fakes async through callModuleSync', async () => {
    const bridge = makeSyncOnlyBridge();
    const host = new StingHost(bridge);

    await expect(host.callModuleAsync('LegacySync', 'readLater')).rejects.toMatchObject({
      name: 'StingNativeError',
      code: 'E_ASYNC_UNSUPPORTED',
      module: 'LegacySync',
      method: 'readLater',
    });

    expect(bridge.callModuleSync).not.toHaveBeenCalled();
  });
});
