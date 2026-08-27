import type { NativeCallResponse, NativeValue, StingRuntimeInfo } from './types.js';

/**
 * The deliberately small transport surface exposed by a Sting native host.
 * Complex values are encoded as JSON so JavaScriptCore, Hermes, QuickJS, and
 * test bridges can implement the same contract without leaking engine types.
 *
 * Async module calls and module events are additive protocol-v1 capabilities.
 * Older sync-only hosts remain valid StingNativeBridge implementations; the
 * higher-level host checks optional entrypoints and fails clearly instead of
 * emulating async/event behavior through synchronous calls.
 */
export interface StingNativeBridge {
  getRuntimeInfo(): string;
  createElement(id: number, type: string): void;
  createTextNode(id: number, value: string): void;
  replaceText(id: number, value: string): void;
  setProperty(id: number, name: string, valueJSON: string): void;
  insertNode(parentId: number, nodeId: number, anchorId: number): void;
  removeNode(parentId: number, nodeId: number): void;
  setEventEnabled(id: number, event: string, enabled: boolean): void;
  callModuleSync(module: string, method: string, argsJSON: string): string;
  callModuleAsync?(module: string, method: string, argsJSON: string, requestId: number): void;
  setModuleEventEnabled?(module: string, event: string, enabled: boolean): string;
}

export function encodeNativeValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

export function decodeRuntimeInfo(value: string): StingRuntimeInfo {
  return JSON.parse(value) as StingRuntimeInfo;
}

export function decodeNativeCallResponse(value: string): NativeCallResponse {
  return JSON.parse(value) as NativeCallResponse;
}

export function decodeNativeValue(value: string): NativeValue {
  return JSON.parse(value) as NativeValue;
}
