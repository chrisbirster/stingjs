import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from '@stingjs/core';
import { render } from '@stingjs/solid';
import {
  Button,
  Heading,
  KeyboardAvoidingView,
  NavigationStack,
  SafeArea,
  Stack,
  View,
  background,
  nativeBlur,
} from './index';

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

function propertyPayloads(bridge: StingNativeBridge, name: string): unknown[] {
  return vi.mocked(bridge.setProperty).mock.calls
    .filter(([, property]) => property === name)
    .map(([, , valueJSON]) => JSON.parse(valueJSON));
}

afterEach(() => resetNativeBridgeForTests());

describe('@stingjs/native styling integration', () => {
  it('keeps a completely unstyled primitive off both styling bridge channels', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(() => View({}), host.root);

    expect(propertyPayloads(bridge, 'style')).toEqual([]);
    expect(propertyPayloads(bridge, 'nativeModifiers')).toEqual([]);

    dispose();
  });

  it('lowers SafeArea to a dedicated native host while preserving the Style IR', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(
      () => SafeArea({ p: '4', gap: '2' }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'safearea')).toBe(true);
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.flexDirection).toBe('column');
    expect(style.paddingTop).toBe(16);
    expect(style.paddingRight).toBe(16);
    expect(style.paddingBottom).toBe(16);
    expect(style.paddingLeft).toBe(16);
    expect(style.gap).toBe(8);

    dispose();
  });

  it('lowers KeyboardAvoidingView to a dedicated native host while preserving the Style IR', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(
      () => KeyboardAvoidingView({ p: '3', gap: '2' }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'keyboardavoidingview')).toBe(true);
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.flexDirection).toBe('column');
    expect(style.paddingTop).toBe(12);
    expect(style.paddingRight).toBe(12);
    expect(style.paddingBottom).toBe(12);
    expect(style.paddingLeft).toBe(12);
    expect(style.gap).toBe(8);

    dispose();
  });

  it('lowers NavigationStack to a dedicated native host and registers native back', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const onBack = vi.fn();

    const dispose = render(
      () => NavigationStack({ onBack }),
      host.root,
    );

    const navigationCall = vi.mocked(bridge.createElement).mock.calls.find(([, type]) => type === 'navigationstack');
    expect(navigationCall).toBeDefined();
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'back' && enabled)).toBe(true);

    dispose();
  });

  it('converges semantic props, sx, and explicit modifiers into one Style IR', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(
      () => Stack({
        p: '4',
        gap: '3',
        sx: { backgroundColor: '#09090b' },
        modifiers: [background('surface'), nativeBlur(20)],
      }),
      host.root,
    );

    const styles = propertyPayloads(bridge, 'style');
    const style = styles.at(-1) as Record<string, unknown>;
    expect(style.__stingResolved).toBe(true);
    expect(style.paddingTop).toBe(16);
    expect(style.paddingRight).toBe(16);
    expect(style.paddingBottom).toBe(16);
    expect(style.paddingLeft).toBe(16);
    expect(style.gap).toBe(12);
    // Explicit modifiers are the highest-precedence portable layer.
    expect(style.backgroundColor).toBe('#ffffff');
    expect(style.flexDirection).toBe('column');

    const nativeModifiers = propertyPayloads(bridge, 'nativeModifiers');
    expect(nativeModifiers.at(-1)).toEqual([{ name: 'blur', value: { radius: 20 } }]);

    dispose();
  });

  it('lowers the built-in primary recipe into ordinary style properties', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(
      () => Button({ variant: 'primary', children: 'Continue' }),
      host.root,
    );

    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.backgroundColor).toBe('#4f46e5');
    expect(style.color).toBe('#ffffff');
    expect(style.borderRadius).toBe(8);
    expect(style.fontWeight).toBe(600);
    expect(style.paddingLeft).toBe(16);
    expect(style.paddingRight).toBe(16);
    expect(style.paddingTop).toBe(10);
    expect(style.paddingBottom).toBe(10);

    dispose();
  });

  it('keeps Heading semantic typography on the existing native text host', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);

    const dispose = render(
      () => Heading({ level: 2, children: 'Settings' }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'text')).toBe(true);
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.fontSize).toBe(28);
    expect(style.fontWeight).toBe(700);

    dispose();
  });

  it('emits a resolved reset after a reactive sx value disappears', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const [active, setActive] = createSignal(true);

    const dispose = render(
      () => Stack({
        sx: () => active() ? { opacity: 0.5 } : false,
      }),
      host.root,
    );

    let styles = propertyPayloads(bridge, 'style') as Array<Record<string, unknown>>;
    expect(styles.at(-1)?.opacity).toBe(0.5);

    setActive(false);
    flush();
    styles = propertyPayloads(bridge, 'style') as Array<Record<string, unknown>>;
    expect(styles.at(-1)?.__stingResolved).toBe(true);
    expect(styles.at(-1)?.opacity).toBeNull();

    dispose();
  });

  it('removes reactive native modifiers through the same bridge channel', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const [active, setActive] = createSignal(true);

    const dispose = render(
      () => Stack({
        modifiers: () => active() ? nativeBlur(18) : [],
      }),
      host.root,
    );

    let modifiers = propertyPayloads(bridge, 'nativeModifiers');
    expect(modifiers.at(-1)).toEqual([{ name: 'blur', value: { radius: 18 } }]);

    setActive(false);
    flush();
    modifiers = propertyPayloads(bridge, 'nativeModifiers');
    expect(modifiers.at(-1)).toEqual([]);

    dispose();
  });
});
