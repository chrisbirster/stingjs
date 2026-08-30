import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const nativeImagePicker = {
    isAvailable: vi.fn(),
    callAsync: vi.fn(),
  };
  return {
    nativeImagePicker,
    createNativeModule: vi.fn(() => nativeImagePicker),
  };
});

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { ImagePicker } from './index.js';

beforeEach(() => {
  mocks.nativeImagePicker.isAvailable.mockReset();
  mocks.nativeImagePicker.callAsync.mockReset();
});

describe('ImagePicker', () => {
  it('binds to the ImagePicker native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('ImagePicker');
  });

  it('dispatches a permission-free system picker request', async () => {
    const result = {
      canceled: false,
      asset: {
        uri: 'file:///tmp/sting-image-picker/photo.jpg',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        width: 1280,
        height: 720,
      },
    };
    mocks.nativeImagePicker.callAsync.mockResolvedValue(result);
    await expect(ImagePicker.pickImage()).resolves.toEqual(result);
    expect(mocks.nativeImagePicker.callAsync).toHaveBeenCalledWith('pickImage');
  });

  it('preserves native cancellation as a normal result', async () => {
    const result = { canceled: true, asset: null };
    mocks.nativeImagePicker.callAsync.mockResolvedValue(result);
    await expect(ImagePicker.pickImage()).resolves.toEqual(result);
  });
});
