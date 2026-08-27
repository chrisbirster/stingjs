import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STING_PROTOCOL_VERSION,
  StingHost,
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from './index.js';

function makeBridge(events = true): StingNativeBridge {
  const bridge: StingNativeBridge = {
    getRuntimeInfo: vi.fn(() => JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'android',
      modules: { Network: '0.1.0' },
    })),
    createElement: vi.fn(),
    createTextNode: vi.fn(),
    replaceText: vi.fn(),
    setProperty: vi.fn(),
    insertNode: vi.fn(),
    removeNode: vi.fn(),
    setEventEnabled: vi.fn(),
    callModuleSync: vi.fn(() => JSON.stringify({ ok: true, value: null })),
    callModuleAsync: vi.fn(),
  };

  if (events) {
    bridge.setModuleEventEnabled = vi.fn(() => JSON.stringify({ ok: true, value: null }));
  }
  return bridge;
}

afterEach(() => resetNativeBridgeForTests());

describe('native module events', () => {
  it('shares one native observation across listeners and disables it after the last removal', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const first = vi.fn();
    const second = vi.fn();

    const removeFirst = host.addModuleEventListener('Network', 'change', first);
    const removeSecond = host.addModuleEventListener('Network', 'change', second);

    expect(bridge.setModuleEventEnabled).toHaveBeenCalledTimes(1);
    expect(bridge.setModuleEventEnabled).toHaveBeenCalledWith('Network', 'change', true);

    expect(globalThis.__stingDispatchModuleEvent?.(
      'Network',
      'change',
      JSON.stringify({ connected: true }),
    )).toBe(true);
    expect(first).toHaveBeenCalledWith({ connected: true });
    expect(second).toHaveBeenCalledWith({ connected: true });

    removeFirst();
    expect(bridge.setModuleEventEnabled).toHaveBeenCalledTimes(1);

    removeSecond();
    expect(bridge.setModuleEventEnabled).toHaveBeenLastCalledWith('Network', 'change', false);
    expect(globalThis.__stingDispatchModuleEvent?.('Network', 'change', 'null')).toBe(false);
  });

  it('keeps duplicate callback subscriptions independent and snapshots re-entrant fanout', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const shared = vi.fn();
    const later = vi.fn();

    const removeFirstShared = host.addModuleEventListener('Network', 'change', shared);
    const removeSecondShared = host.addModuleEventListener('Network', 'change', shared);
    let removeLater = () => {};
    const removeSelf = host.addModuleEventListener('Network', 'change', () => {
      removeSelf();
      removeLater();
    });
    removeLater = host.addModuleEventListener('Network', 'change', later);

    host.dispatchModuleEvent('Network', 'change', { connected: false });

    expect(shared).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledTimes(1);

    removeFirstShared();
    host.dispatchModuleEvent('Network', 'change', null);
    expect(shared).toHaveBeenCalledTimes(3);

    removeSecondShared();
    expect(bridge.setModuleEventEnabled).toHaveBeenLastCalledWith('Network', 'change', false);
  });

  it('fails clearly on protocol-v1 hosts that do not implement module events', () => {
    const host = new StingHost(makeBridge(false));

    expect(() => host.addModuleEventListener('Network', 'change', vi.fn())).toThrowError(
      expect.objectContaining({
        name: 'StingNativeError',
        code: 'E_EVENTS_UNSUPPORTED',
        module: 'Network',
        method: 'addListener:change',
      }),
    );
  });

  it('preserves structured native errors while enabling an event source', () => {
    const bridge = makeBridge();
    bridge.setModuleEventEnabled = vi.fn(() => JSON.stringify({
      ok: false,
      error: {
        code: 'E_EVENT_NOT_FOUND',
        message: 'No such native event',
        module: 'Network',
        method: 'addListener:missing',
      },
    }));
    const host = new StingHost(bridge);

    expect(() => host.addModuleEventListener('Network', 'missing', vi.fn())).toThrowError(
      expect.objectContaining({
        name: 'StingNativeError',
        code: 'E_EVENT_NOT_FOUND',
        module: 'Network',
      }),
    );
  });

  it('clears dispatchability before runtime disposal disables native observations', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const listener = vi.fn();
    host.addModuleEventListener('Network', 'change', listener);

    bridge.setModuleEventEnabled = vi.fn((module, event, enabled) => {
      if (!enabled) {
        expect(host.dispatchModuleEvent(module, event, { late: true })).toBe(false);
      }
      return JSON.stringify({ ok: true, value: null });
    });

    globalThis.__stingDisposeRuntime?.();

    expect(listener).not.toHaveBeenCalled();
    expect(bridge.setModuleEventEnabled).toHaveBeenCalledWith('Network', 'change', false);
    expect(globalThis.__stingDispatchModuleEvent).toBeUndefined();
  });
});
