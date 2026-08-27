import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nativeFilesystem: {
    isAvailable: vi.fn(),
    callAsync: vi.fn(),
  },
  createNativeModule: vi.fn(),
}));

mocks.createNativeModule.mockReturnValue(mocks.nativeFilesystem);

vi.mock('@stingjs/modules-core', () => ({
  createNativeModule: mocks.createNativeModule,
}));

import { Filesystem } from './index.js';

beforeEach(() => {
  mocks.nativeFilesystem.isAvailable.mockReset();
  mocks.nativeFilesystem.callAsync.mockReset();
});

describe('Filesystem', () => {
  it('binds to the Filesystem native module', () => {
    expect(mocks.createNativeModule).toHaveBeenCalledWith('Filesystem');
  });

  it('uses documents as the default portable root', async () => {
    mocks.nativeFilesystem.callAsync.mockResolvedValue('hello');

    await expect(Filesystem.readText('notes/today.txt')).resolves.toBe('hello');
    expect(mocks.nativeFilesystem.callAsync).toHaveBeenCalledWith(
      'readText',
      ['notes/today.txt', 'documents'],
    );
  });

  it('maps cache writes to an asynchronous native call', async () => {
    mocks.nativeFilesystem.callAsync.mockResolvedValue(null);

    await Filesystem.writeText('session.txt', 'sting', { directory: 'cache' });
    expect(mocks.nativeFilesystem.callAsync).toHaveBeenCalledWith(
      'writeText',
      ['session.txt', 'sting', 'cache'],
    );
  });

  it('returns structured file metadata', async () => {
    mocks.nativeFilesystem.callAsync.mockResolvedValue({
      exists: true,
      type: 'file',
      size: 5,
      modifiedAt: 1234,
    });

    await expect(Filesystem.getInfo('session.txt', { directory: 'cache' })).resolves.toEqual({
      exists: true,
      type: 'file',
      size: 5,
      modifiedAt: 1234,
    });
  });

  it('preserves structured native rejections', async () => {
    const error = Object.assign(new Error('File does not exist'), {
      name: 'StingNativeError',
      code: 'E_NOT_FOUND',
      module: 'Filesystem',
      method: 'readText',
    });
    mocks.nativeFilesystem.callAsync.mockRejectedValue(error);

    await expect(Filesystem.readText('missing.txt')).rejects.toMatchObject({
      name: 'StingNativeError',
      code: 'E_NOT_FOUND',
      module: 'Filesystem',
      method: 'readText',
    });
  });
});
