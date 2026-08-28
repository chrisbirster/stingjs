import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from '@stingjs/core';
import { createElement, createNativeModuleView, render } from './index.js';

function makeBridge(): StingNativeBridge {
  return {
    getRuntimeInfo: vi.fn(() => JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: {},
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

describe('Sting Solid native module views', () => {
  it('creates a normal host node and routes props/events through the existing renderer', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const onReady = vi.fn();
    const CameraPreview = createNativeModuleView<{
      mode: string;
      onReady: () => void;
    }>('Camera', 'Preview');

    const node = CameraPreview({ mode: 'portrait', onReady });
    const dispose = render(() => node, host.root);

    expect(node.type).toBe('__sting_module_view__:Camera:Preview');
    expect(bridge.createElement).toHaveBeenCalledWith(node.id, node.type);
    expect(bridge.setProperty).toHaveBeenCalledWith(node.id, 'mode', '"portrait"');
    expect(bridge.setEventEnabled).toHaveBeenCalledWith(node.id, 'ready', true);
    expect(bridge.insertNode).toHaveBeenCalledWith(0, node.id, -1);

    host.dispatchEvent(node.id, 'ready', null);
    expect(onReady).toHaveBeenCalledOnce();

    dispose();
  });
});

describe('Sting Solid renderer disposal', () => {
  it('lets the universal renderer normalize a function-valued root expression', () => {
    const host = installNativeBridge(makeBridge());
    const rendered = createElement('view');

    const dispose = render(() => () => rendered, host.root);

    expect(host.root.children).toEqual([rendered]);

    dispose();
    expect(host.root.children).toEqual([]);
  });

  it('removes nodes mounted by render while preserving pre-existing container children', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const baseline = host.createElement('baseline');
    host.insertNode(host.root, baseline);

    const rendered = createElement('view');
    const dispose = render(() => rendered, host.root);

    expect(host.root.children).toEqual([baseline, rendered]);

    dispose();

    expect(host.root.children).toEqual([baseline]);
    expect(rendered.parent).toBeNull();
    expect(bridge.removeNode).toHaveBeenCalledWith(host.root.id, rendered.id);
  });

  it('does not accumulate stale root nodes across sequential renders', () => {
    const host = installNativeBridge(makeBridge());

    const first = createElement('first');
    const disposeFirst = render(() => first, host.root);
    expect(host.root.children).toEqual([first]);

    disposeFirst();
    disposeFirst();
    expect(host.root.children).toEqual([]);

    const second = createElement('second');
    const disposeSecond = render(() => second, host.root);
    expect(host.root.children).toEqual([second]);

    disposeSecond();
    expect(host.root.children).toEqual([]);
  });
});
