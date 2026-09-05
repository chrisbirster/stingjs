import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const nativeCamera = { isAvailable: vi.fn(), permissionStatus: vi.fn(), requestPermission: vi.fn(), callAsync: vi.fn() };
  return { nativeCamera, createNativeModule: vi.fn(() => nativeCamera), createNativeModuleView: vi.fn(() => 'CameraView') };
});
vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
vi.mock('@stingjs/solid', () => ({ createNativeModuleView: mocks.createNativeModuleView }));
import { Camera, CameraView } from './index.js';

describe('Camera', () => {
  it('uses the shared permission and module-view contracts', async () => {
    mocks.nativeCamera.permissionStatus.mockReturnValue('undetermined');
    mocks.nativeCamera.requestPermission.mockResolvedValue('granted');
    expect(Camera.getPermissionStatus()).toBe('undetermined');
    await expect(Camera.requestPermission()).resolves.toBe('granted');
    expect(mocks.createNativeModuleView).toHaveBeenCalledWith('Camera', 'Preview');
    expect(CameraView).toBe('CameraView');
  });
  it('captures portable cached photo metadata', async () => {
    mocks.nativeCamera.callAsync.mockResolvedValue({ uri: 'file:///tmp/photo.jpg', width: 640, height: 480, mimeType: 'image/jpeg' });
    await expect(Camera.capturePhoto()).resolves.toEqual({ uri: 'file:///tmp/photo.jpg', width: 640, height: 480, mimeType: 'image/jpeg' });
  });
});
