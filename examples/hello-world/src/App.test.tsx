import { afterEach, describe, expect, it } from 'vitest';
import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type StingNativeBridge,
} from '@stingjs/core';
import { renderApp } from '@stingjs/solid';
import App from './App.js';

interface ElementRecord {
  id: number;
  type: string;
}

interface ModuleCall {
  module: string;
  method: string;
  args: unknown[];
}

class RecordingBridge implements StingNativeBridge {
  readonly elements: ElementRecord[] = [];
  readonly textValues = new Map<number, string>();
  readonly textReplacements: Array<{ id: number; value: string }> = [];
  readonly enabledEvents: Array<{ id: number; event: string; enabled: boolean }> = [];
  readonly moduleCalls: ModuleCall[] = [];

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: { Haptics: '0.1.0' },
    });
  }

  createElement(id: number, type: string): void {
    this.elements.push({ id, type });
  }

  createTextNode(id: number, value: string): void {
    this.textValues.set(id, value);
  }

  replaceText(id: number, value: string): void {
    this.textValues.set(id, value);
    this.textReplacements.push({ id, value });
  }

  setProperty(_id: number, _name: string, _valueJSON: string): void {}

  insertNode(_parentId: number, _nodeId: number, _anchorId: number): void {}

  removeNode(_parentId: number, _nodeId: number): void {}

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.enabledEvents.push({ id, event, enabled });
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    this.moduleCalls.push({ module, method, args: JSON.parse(argsJSON) as unknown[] });
    return JSON.stringify({ ok: true, value: null });
  }
}

afterEach(() => {
  resetNativeBridgeForTests();
});

describe('StingJS hello-world native loop', () => {
  it('round-trips a native press through Solid reactivity and Haptics', () => {
    const bridge = new RecordingBridge();
    installNativeBridge(bridge);
    const dispose = renderApp(() => <App />);

    try {
      const button = bridge.elements.find(({ type }) => type === 'button');
      expect(button, 'Solid should create a native button').toBeDefined();
      if (!button) return;

      expect(bridge.enabledEvents).toContainEqual({
        id: button.id,
        event: 'press',
        enabled: true,
      });

      const replacementsBeforePress = bridge.textReplacements.length;
      globalThis.__stingDispatchEvent?.(button.id, 'press', 'null');

      const reactiveReplacements = bridge.textReplacements.slice(replacementsBeforePress);
      expect(
        reactiveReplacements.some(({ value }) => value.includes('1')),
        'Solid signal update should emit a native text replacement containing the new count',
      ).toBe(true);

      expect(bridge.moduleCalls).toContainEqual({
        module: 'Haptics',
        method: 'impact',
        args: ['medium'],
      });
    } finally {
      dispose();
    }
  });
});
