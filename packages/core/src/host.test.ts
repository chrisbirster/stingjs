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
    callModuleAsync: vi.fn(),
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

  it('reactivates descendant events when keyed reconciliation reinserts the same subtree', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const container = host.createElement('view');
    const row = host.createElement('view');
    const button = host.createElement('button');
    const onPress = vi.fn();

    host.insertNode(host.root, container);
    host.insertNode(row, button);
    host.setProperty(button, 'onPress', onPress);
    host.insertNode(container, row);

    const eventTransitions: boolean[] = [];
    bridge.setEventEnabled = vi.fn((_id, event, enabled) => {
      if (event === 'press') eventTransitions.push(enabled);
    });

    host.removeNode(container, row);
    globalThis.__stingDispatchEvent?.(button.id, 'press', 'null');
    expect(onPress).not.toHaveBeenCalled();

    host.insertNode(container, row);
    globalThis.__stingDispatchEvent?.(button.id, 'press', 'null');

    expect(eventTransitions).toEqual([false, true]);
    expect(onPress).toHaveBeenCalledTimes(1);
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

  it('resolves asynchronous native calls with primitive and structured results', async () => {
    const bridge = makeBridge();
    installNativeBridge(bridge);

    const primitive = installNativeBridge(bridge).callModuleAsync('AsyncTest', 'primitive', [7]);
    const primitiveRequestId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];
    expect(primitiveRequestId).toBeTypeOf('number');
    expect(globalThis.__stingResolveModuleCall?.(
      primitiveRequestId!,
      JSON.stringify({ ok: true, value: 14 }),
    )).toBe(true);
    await expect(primitive).resolves.toBe(14);

    const host = installNativeBridge(bridge);
    const structured = host.callModuleAsync('AsyncTest', 'object');
    const structuredRequestId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];
    expect(globalThis.__stingResolveModuleCall?.(
      structuredRequestId!,
      JSON.stringify({ ok: true, value: { name: 'sting', count: 2 } }),
    )).toBe(true);
    await expect(structured).resolves.toEqual({ name: 'sting', count: 2 });
  });

  it('rejects asynchronous native calls with structured StingNativeError data', async () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const pending = host.callModuleAsync('Filesystem', 'readFile', ['/missing']);
    const requestId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];

    expect(globalThis.__stingResolveModuleCall?.(
      requestId!,
      JSON.stringify({
        ok: false,
        error: {
          code: 'E_NOT_FOUND',
          message: 'File does not exist',
          module: 'Filesystem',
          method: 'readFile',
          details: { uri: '/missing' },
        },
      }),
    )).toBe(true);

    await expect(pending).rejects.toMatchObject({
      name: 'StingNativeError',
      code: 'E_NOT_FOUND',
      module: 'Filesystem',
      method: 'readFile',
      details: { uri: '/missing' },
    });
  });

  it('settles concurrent asynchronous calls independently when native completes out of order', async () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const first = host.callModuleAsync('AsyncTest', 'first');
    const firstId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];
    const second = host.callModuleAsync('AsyncTest', 'second');
    const secondId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];

    expect(secondId).not.toBe(firstId);
    expect(globalThis.__stingResolveModuleCall?.(
      secondId!,
      JSON.stringify({ ok: true, value: 'second-result' }),
    )).toBe(true);
    expect(globalThis.__stingResolveModuleCall?.(
      firstId!,
      JSON.stringify({ ok: true, value: 'first-result' }),
    )).toBe(true);

    await expect(second).resolves.toBe('second-result');
    await expect(first).resolves.toBe('first-result');
  });

  it('ignores duplicate, stale, and unknown asynchronous completion request ids', async () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const pending = host.callModuleAsync('AsyncTest', 'once');
    const requestId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];

    expect(globalThis.__stingResolveModuleCall?.(
      requestId!,
      JSON.stringify({ ok: true, value: 'first' }),
    )).toBe(true);
    expect(globalThis.__stingResolveModuleCall?.(
      requestId!,
      JSON.stringify({ ok: true, value: 'duplicate' }),
    )).toBe(false);
    expect(globalThis.__stingResolveModuleCall?.(
      Number.MAX_SAFE_INTEGER,
      JSON.stringify({ ok: true, value: 'unknown' }),
    )).toBe(false);

    await expect(pending).resolves.toBe('first');
  });

  it('rejects outstanding asynchronous calls when the runtime is disposed', async () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const pending = host.callModuleAsync('Filesystem', 'readFile', ['/slow']);
    const requestId = vi.mocked(bridge.callModuleAsync).mock.calls.at(-1)?.[3];

    globalThis.__stingDisposeRuntime?.();

    await expect(pending).rejects.toMatchObject({
      name: 'StingNativeError',
      code: 'E_RUNTIME_DISPOSED',
      module: 'Filesystem',
      method: 'readFile',
    });
    expect(globalThis.__stingResolveModuleCall).toBeUndefined();
    expect(host.completeModuleAsync(
      requestId!,
      JSON.stringify({ ok: true, value: 'too-late' }),
    )).toBe(false);
  });

  it('never reuses asynchronous request ids across host instances', () => {
    const firstBridge = makeBridge();
    const firstHost = new StingHost(firstBridge);
    void firstHost.callModuleAsync('AsyncTest', 'first');
    const firstId = vi.mocked(firstBridge.callModuleAsync).mock.calls.at(-1)?.[3];

    const secondBridge = makeBridge();
    const secondHost = new StingHost(secondBridge);
    void secondHost.callModuleAsync('AsyncTest', 'second');
    const secondId = vi.mocked(secondBridge.callModuleAsync).mock.calls.at(-1)?.[3];

    expect(secondId).toBeGreaterThan(firstId!);

    firstHost.dispose();
    secondHost.dispose();
  });
});
