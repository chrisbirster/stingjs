import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const nativeSharing = {
    isAvailable: vi.fn(),
    callAsync: vi.fn(),
  };
  return {
    nativeSharing,
    createNativeModule: vi.fn(() => nativeSharing),
  };
});

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { Sharing } from './index.js';

beforeEach(() => {
  mocks.nativeSharing.isAvailable.mockReset();
  mocks.nativeSharing.callAsync.mockReset();
});

describe('Sharing', () => {
  it('binds to the Sharing native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('Sharing');
  });

  it('normalizes a portable share payload', async () => {
    mocks.nativeSharing.callAsync.mockResolvedValue(null);
    await Sharing.share({ text: 'StingJS', url: 'https://stingjs.com', subject: 'Native Solid' });
    expect(mocks.nativeSharing.callAsync).toHaveBeenCalledWith(
      'share',
      ['StingJS', 'https://stingjs.com', 'Native Solid'],
    );
  });

  it('allows url-only shares', async () => {
    mocks.nativeSharing.callAsync.mockResolvedValue(null);
    await Sharing.share({ url: 'https://stingjs.com' });
    expect(mocks.nativeSharing.callAsync).toHaveBeenCalledWith(
      'share',
      ['', 'https://stingjs.com', ''],
    );
  });

  it('rejects an empty payload before native dispatch', async () => {
    await expect(Sharing.share({})).rejects.toThrow(TypeError);
    expect(mocks.nativeSharing.callAsync).not.toHaveBeenCalled();
  });
});
