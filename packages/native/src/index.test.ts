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
  AppRoot,
  Button,
  FocusView,
  GestureView,
  Heading,
  KeyboardAvoidingView,
  Modal,
  NavigationStack,
  SafeArea,
  Sheet,
  Stack,
  View,
  VirtualList,
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
    const dispose = render(() => SafeArea({ p: '4', gap: '2' }), host.root);
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
    const dispose = render(() => KeyboardAvoidingView({ p: '3', gap: '2' }), host.root);
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
    const dispose = render(() => NavigationStack({ onBack: vi.fn() }), host.root);
    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'navigationstack')).toBe(true);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'back' && enabled)).toBe(true);
    dispose();
  });

  it('lowers GestureView to a dedicated native host and registers normalized gesture events', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const dispose = render(() => GestureView({ p: '2', onTap: vi.fn(), onPan: vi.fn() }), host.root);
    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'gestureview')).toBe(true);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'tap' && enabled)).toBe(true);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'pan' && enabled)).toBe(true);
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.flexDirection).toBe('column');
    expect(style.paddingTop).toBe(8);
    dispose();
  });

  it('lowers modal and sheet presentation to dedicated native hosts', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const disposeModal = render(() => Modal({ presented: true, onDismiss: vi.fn() }), host.root);
    const disposeSheet = render(() => Sheet({ presented: false, onDismiss: vi.fn() }), host.root);

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'modal')).toBe(true);
    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'sheet')).toBe(true);
    expect(propertyPayloads(bridge, 'presented')).toEqual([true, false]);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.filter(([, event, enabled]) => event === 'dismiss' && enabled)).toHaveLength(2);

    disposeModal();
    disposeSheet();
  });

  it('lowers VirtualList to a native-windowed host with explicit fixed extent', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const dispose = render(
      () => VirtualList({ itemExtent: 64, overscan: 3, sx: { height: 320 } }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'virtuallist')).toBe(true);
    expect(propertyPayloads(bridge, 'itemExtent').at(-1)).toBe(64);
    expect(propertyPayloads(bridge, 'overscan').at(-1)).toBe(3);
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.height).toBe(320);
    dispose();
  });

  it('forwards richer accessibility metadata and explicit focus events', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const dispose = render(
      () => FocusView({
        accessibilityLabel: 'Search',
        accessibilityHint: 'Opens search',
        accessibilityRole: 'button',
        accessibilityValue: 'Closed',
        focusable: true,
        autoFocus: true,
        onFocus: vi.fn(),
        onBlur: vi.fn(),
      }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'focusview')).toBe(true);
    expect(propertyPayloads(bridge, 'accessibilityHint').at(-1)).toBe('Opens search');
    expect(propertyPayloads(bridge, 'accessibilityRole').at(-1)).toBe('button');
    expect(propertyPayloads(bridge, 'accessibilityValue').at(-1)).toBe('Closed');
    expect(propertyPayloads(bridge, 'focusable').at(-1)).toBe(true);
    expect(propertyPayloads(bridge, 'autoFocus').at(-1)).toBe(true);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'focus' && enabled)).toBe(true);
    expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, event, enabled]) => event === 'blur' && enabled)).toBe(true);
    dispose();
  });

  it('lowers AppRoot to a full-bleed styled native lifecycle host', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const dispose = render(
      () => AppRoot({ p: '2', onAppear: vi.fn(), onDisappear: vi.fn(), onAppStateChange: vi.fn() }),
      host.root,
    );

    expect(vi.mocked(bridge.createElement).mock.calls.some(([, type]) => type === 'approot')).toBe(true);
    for (const event of ['appear', 'disappear', 'appStateChange']) {
      expect(vi.mocked(bridge.setEventEnabled).mock.calls.some(([, name, enabled]) => name === event && enabled)).toBe(true);
    }
    const style = propertyPayloads(bridge, 'style').at(-1) as Record<string, unknown>;
    expect(style.flexDirection).toBe('column');
    expect(style.paddingTop).toBe(8);
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
    expect(style.backgroundColor).toBe('#ffffff');
    expect(style.flexDirection).toBe('column');
    expect(propertyPayloads(bridge, 'nativeModifiers').at(-1)).toEqual([{ name: 'blur', value: { radius: 20 } }]);
    dispose();
  });

  it('lowers the built-in primary recipe into ordinary style properties', () => {
    const bridge = makeBridge();
    const host = installNativeBridge(bridge);
    const dispose = render(() => Button({ variant: 'primary', children: 'Continue' }), host.root);
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
    const dispose = render(() => Heading({ level: 2, children: 'Settings' }), host.root);
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
    const dispose = render(() => Stack({ sx: () => active() ? { opacity: 0.5 } : false }), host.root);
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
    const dispose = render(() => Stack({ modifiers: () => active() ? nativeBlur(18) : [] }), host.root);
    let modifiers = propertyPayloads(bridge, 'nativeModifiers');
    expect(modifiers.at(-1)).toEqual([{ name: 'blur', value: { radius: 18 } }]);
    setActive(false);
    flush();
    modifiers = propertyPayloads(bridge, 'nativeModifiers');
    expect(modifiers.at(-1)).toEqual([]);
    dispose();
  });
});
