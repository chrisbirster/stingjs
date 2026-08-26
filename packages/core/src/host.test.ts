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
  it('never reuses native node ids across host instances', () => {
    const firstHost = new StingHost(makeBridge());
    const firstNode = firstHost.createElement('view');

    const secondHost = new StingHost(makeBridge());
    const secondNode = secondHost.createElement('view');

    expect(secondNode.id).toBeGreaterThan(firstNode.id);
  });

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

  it('deduplicates identical text writes before crossing the native bridge', () => {
    const bridge = makeBridge();
    const host = new StingHost(bridge);
    const text = host.createTextNode('alpha');

    host.replaceText(text, 'alpha');
    expect(bridge.replaceText).not.toHaveBeenCalled();

    host.replaceText(text, 'beta');
    host.replaceText(text, 'beta');

    expect(bridge.replaceText).toHaveBeenCalledTimes(1);
    expect(bridge.replaceText).toHaveBeenCalledWith(text.id, 'beta');
    expect(text.textValue).toBe('beta');
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

  it('tears down descendant event callbacks before a native subtree is removed', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const parent = host.createElement('view');
    const button = host.createElement('button');
    const onPress = vi.fn();

    host.insertNode(host.root, parent);
    host.insertNode(parent, button);
    host.setProperty(button, 'onPress', onPress);

    const calls: string[] = [];
    bridge.setEventEnabled = vi.fn((id, event, enabled) => {
      calls.push(`event:${id}:${event}:${enabled}`);
    });
    bridge.removeNode = vi.fn((parentId, nodeId) => {
      calls.push(`remove:${parentId}:${nodeId}`);
    });

    host.removeNode(host.root, parent);

    expect(calls).toEqual([
      `event:${button.id}:press:false`,
      `remove:${host.root.id}:${parent.id}`,
    ]);

    globalThis.__stingDispatchEvent?.(button.id, 'press', 'null');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('rejects an incompatible native bridge before rendering begins', () => {
    const bridge = makeBridge();
    bridge.getRuntimeInfo = vi.fn(() => JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION + 1,
      platform: 'ios',
      modules: {},
    }));

    expect(() => installNativeBridge(bridge)).toThrow(
      `Incompatible Sting native runtime protocol ${STING_PROTOCOL_VERSION + 1}`,
    );
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
