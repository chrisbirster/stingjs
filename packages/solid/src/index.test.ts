import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal, Errored, flush } from 'solid-js';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingNativeBridge,
} from '@stingjs/core';
import { createComponent, createElement, render } from './index.js';

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

describe('Sting Solid renderer disposal', () => {
  it('lets the universal renderer normalize a function-valued root expression', () => {
    const host = installNativeBridge(makeBridge());
    const rendered = createElement('view');

    const dispose = render(() => () => rendered, host.root);

    expect(host.root.children).toEqual([rendered]);

    dispose();
    expect(host.root.children).toEqual([]);
  });

  it('lets Errored replace the protected native root after a prior render is disposed', () => {
    const host = installNativeBridge(makeBridge());
    const stale = createElement('stale');
    const disposeStale = render(() => stale, host.root);
    disposeStale();

    const content = createElement('content');
    const fallback = createElement('fallback');
    const [failed, setFailed] = createSignal(false);
    const HostErrored = Errored as unknown as (props: {
      readonly children: HostNode;
      readonly fallback: (error: () => unknown, reset: () => void) => HostNode;
    }) => HostNode;

    const dispose = render(
      () => createComponent(HostErrored, {
        get children() {
          if (failed()) throw new Error('boom');
          return content;
        },
        fallback: (_error, _reset) => fallback,
      }),
      host.root,
    );

    expect(host.root.children).toEqual([content]);

    setFailed(true);
    flush();

    expect(host.root.children).toEqual([fallback]);
    expect(content.parent).toBeNull();

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
