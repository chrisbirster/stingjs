import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STING_PROTOCOL_VERSION,
  StingHost,
  StingNativeError,
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from './index.js';

function makeBridge(): StingNativeBridge {
  return {
    getRuntimeInfo: vi.fn(() => JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: { Haptics: '0.1.0' },
    })),
    createElement: vi.fn(),
    createTextNode: vi.fn(),
    replaceText: vi.fn(),
    setProperty: vi.fn(),
    insertNode: vi.fn(),
    removeNode: vi.fn(),
    setEventEnabled: vi.fn(),
    callModuleSync: vi.fn(() => JSON.stringify({ ok: true, value: null })),
  };
}

afterEach(() => resetNativeBridgeForTests());

describe('StingHost', () => {
  it('keeps structural renderer queries in the JS shadow tree', () => {
    const bridge = makeBridge();
    const host = new StingHost(bridge);
    const parent = host.createElement('view');
    const first = host.createElement('text');
    const second = host.createElement('button');

    host.insertNode(host.root, parent);
    host.insertNode(parent, second);
    host.insertNode(parent, first, second);

    expect(host.getFirstChild(parent)).toBe(first);
    expect(host.getNextSibling(first)).toBe(second);
    expect(host.getParentNode(second)).toBe(parent);
    expect(bridge.insertNode).toHaveBeenLastCalledWith(parent.id, first.id, second.id);
  });

  it('keeps event callbacks in JavaScript and round-trips native events by identity', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const button = host.createElement('button');
    const onPress = vi.fn();

    host.setProperty(button, 'onPress', onPress);
    expect(bridge.setEventEnabled).toHaveBeenCalledWith(button.id, 'press', true);

    globalThis.__stingDispatchEvent?.(button.id, 'press', '{"source":"native"}');
    expect(onPress).toHaveBeenCalledWith({ source: 'native' });
  });

  it('serializes ordinary properties instead of leaking JavaScript objects to native', () => {
    const bridge = makeBridge();
    const host = new StingHost(bridge);
    const view = host.createElement('view');

    host.setProperty(view, 'style', { padding: 12, flexDirection: 'column' });

    expect(bridge.setProperty).toHaveBeenCalledWith(
      view.id,
      'style',
      '{"padding":12,"flexDirection":"column"}',
    );
  });

  it('turns native module failures into stable StingNativeError instances', () => {
    const bridge = makeBridge();
    bridge.callModuleSync = vi.fn(() => JSON.stringify({
      ok: false,
      error: {
        code: 'E_METHOD_NOT_FOUND',
        message: 'No such method',
        module: 'Haptics',
        method: 'missing',
      },
    }));
    const host = new StingHost(bridge);

    expect(() => host.callModuleSync('Haptics', 'missing')).toThrow(StingNativeError);
  });
});
