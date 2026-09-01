import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const subscription = { remove: vi.fn() };
  const nativeLocation = {
    isAvailable: vi.fn(),
    permissionStatus: vi.fn(),
    requestPermission: vi.fn(),
    callAsync: vi.fn(),
    addListener: vi.fn(() => subscription),
  };
  return { nativeLocation, subscription, createNativeModule: vi.fn(() => nativeLocation) };
});

vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
import { Location } from './index.js';

beforeEach(() => {
  mocks.nativeLocation.permissionStatus.mockReset();
  mocks.nativeLocation.requestPermission.mockReset();
  mocks.nativeLocation.callAsync.mockReset();
  mocks.nativeLocation.addListener.mockClear();
});

describe('Location', () => {
  it('uses the shared foreground permission contract', async () => {
    mocks.nativeLocation.permissionStatus.mockReturnValue('undetermined');
    mocks.nativeLocation.requestPermission.mockResolvedValue('granted');
    expect(Location.getPermissionStatus()).toBe('undetermined');
    await expect(Location.requestPermission()).resolves.toBe('granted');
    expect(mocks.nativeLocation.permissionStatus).toHaveBeenCalledWith('foreground');
    expect(mocks.nativeLocation.requestPermission).toHaveBeenCalledWith('foreground');
  });

  it('normalizes current and watched positions', async () => {
    const raw = {
      coords: { latitude: 39.9, longitude: -77.6, altitude: 120, accuracy: 8, altitudeAccuracy: 12, heading: -1, speed: 0 },
      timestamp: 1234,
    };
    mocks.nativeLocation.callAsync.mockResolvedValue(raw);
    await expect(Location.getCurrentPosition()).resolves.toEqual(raw);
    const listener = vi.fn();
    Location.watchPosition(listener);
    const callback = mocks.nativeLocation.addListener.mock.calls[0]?.[1];
    callback(raw);
    expect(listener).toHaveBeenCalledWith(raw);
  });
});
