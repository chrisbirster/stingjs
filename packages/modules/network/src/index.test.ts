import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const nativeNetwork = {
    isAvailable: vi.fn(),
    callAsync: vi.fn(),
    addListener: vi.fn(),
  };
  return {
    nativeNetwork,
    createNativeModule: vi.fn(() => nativeNetwork),
  };
});

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { Network } from './index.js';

beforeEach(() => {
  mocks.nativeNetwork.isAvailable.mockReset();
  mocks.nativeNetwork.callAsync.mockReset();
  mocks.nativeNetwork.addListener.mockReset();
});

describe('Network', () => {
  it('binds to the Network native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('Network');
  });

  it('returns the portable native network snapshot', async () => {
    const state = {
      connected: true,
      internetReachable: true,
      type: 'wifi',
      expensive: false,
    };
    mocks.nativeNetwork.callAsync.mockResolvedValue(state);
    await expect(Network.getState()).resolves.toEqual(state);
    expect(mocks.nativeNetwork.callAsync).toHaveBeenCalledWith('getState');
  });

  it('uses the shared module event subscription path', () => {
    const remove = vi.fn();
    mocks.nativeNetwork.addListener.mockReturnValue({ remove });
    const listener = vi.fn();

    const subscription = Network.addNetworkStateListener(listener);
    expect(mocks.nativeNetwork.addListener).toHaveBeenCalledWith('change', expect.any(Function));

    const nativeListener = mocks.nativeNetwork.addListener.mock.calls[0]?.[1];
    nativeListener({ connected: false, internetReachable: false, type: 'none', expensive: false });
    expect(listener).toHaveBeenCalledWith({
      connected: false,
      internetReachable: false,
      type: 'none',
      expensive: false,
    });
    subscription.remove();
    expect(remove).toHaveBeenCalledOnce();
  });
});
