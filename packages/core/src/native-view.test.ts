import { describe, expect, it } from 'vitest';
import {
  decodeNativeModuleViewType,
  encodeNativeModuleViewType,
  STING_NATIVE_MODULE_VIEW_PREFIX,
} from './native-view.js';

describe('native module view identity', () => {
  it('round-trips module and view names through the reserved host type', () => {
    const type = encodeNativeModuleViewType('Camera', 'Preview');

    expect(type).toBe(`${STING_NATIVE_MODULE_VIEW_PREFIX}Camera:Preview`);
    expect(decodeNativeModuleViewType(type)).toEqual({
      module: 'Camera',
      viewType: 'Preview',
    });
  });

  it('leaves ordinary Sting host element types alone', () => {
    expect(decodeNativeModuleViewType('view')).toBeNull();
    expect(decodeNativeModuleViewType('textinput')).toBeNull();
  });

  it('rejects empty, ambiguous, and malformed reserved identities', () => {
    expect(() => encodeNativeModuleViewType('', 'Preview')).toThrow(TypeError);
    expect(() => encodeNativeModuleViewType('Camera', '')).toThrow(TypeError);
    expect(() => encodeNativeModuleViewType('Camera:Other', 'Preview')).toThrow(TypeError);
    expect(() => decodeNativeModuleViewType(`${STING_NATIVE_MODULE_VIEW_PREFIX}Camera`)).toThrow(TypeError);
    expect(() => decodeNativeModuleViewType(`${STING_NATIVE_MODULE_VIEW_PREFIX}Camera:Preview:Extra`)).toThrow(TypeError);
  });
});
