import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const nativeSecureStore = {
    isAvailable: vi.fn(),
    callAsync: vi.fn(),
  };
  return {
    nativeSecureStore,
    createNativeModule: vi.fn(() => nativeSecureStore),
  };
});

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { SecureStore } from './index.js';

beforeEach(() => {
  mocks.nativeSecureStore.isAvailable.mockReset();
  mocks.nativeSecureStore.callAsync.mockReset();
});

describe('SecureStore', () => {
  it('binds to the SecureStore native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('SecureStore');
  });

  it('uses the default namespace for reads', async () => {
    mocks.nativeSecureStore.callAsync.mockResolvedValue('secret');
    await expect(SecureStore.getItem('token')).resolves.toBe('secret');
    expect(mocks.nativeSecureStore.callAsync).toHaveBeenCalledWith(
      'getItem',
      ['token', 'default'],
    );
  });

  it('passes explicit namespaces to writes', async () => {
    mocks.nativeSecureStore.callAsync.mockResolvedValue(null);
    await SecureStore.setItem('token', 'secret', { namespace: 'session' });
    expect(mocks.nativeSecureStore.callAsync).toHaveBeenCalledWith(
      'setItem',
      ['token', 'secret', 'session'],
    );
  });

  it('returns false only when native storage reports false', async () => {
    mocks.nativeSecureStore.callAsync.mockResolvedValue(false);
    await expect(SecureStore.hasItem('missing')).resolves.toBe(false);
  });

  it('rejects empty keys before native dispatch', async () => {
    await expect(SecureStore.getItem('')).rejects.toThrow(TypeError);
    expect(mocks.nativeSecureStore.callAsync).not.toHaveBeenCalled();
  });
});
