import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const nativeNotifications = { isAvailable: vi.fn(), permissionStatus: vi.fn(), requestPermission: vi.fn(), callAsync: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) };
  return { nativeNotifications, createNativeModule: vi.fn(() => nativeNotifications) };
});
vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
import { Notifications } from './index.js';

describe('Notifications', () => {
  it('uses the shared permission contract', async () => {
    mocks.nativeNotifications.permissionStatus.mockReturnValue('undetermined');
    mocks.nativeNotifications.requestPermission.mockResolvedValue('granted');
    expect(Notifications.getPermissionStatus()).toBe('undetermined');
    await expect(Notifications.requestPermission()).resolves.toBe('granted');
  });
  it('schedules, lists, cancels, and subscribes portably', async () => {
    mocks.nativeNotifications.callAsync.mockResolvedValueOnce('note-1');
    await expect(Notifications.schedule({ title: 'Hello' })).resolves.toBe('note-1');
    mocks.nativeNotifications.callAsync.mockResolvedValueOnce([{ id: 'note-1', title: 'Hello', body: '', at: 123 }]);
    await expect(Notifications.getScheduled()).resolves.toEqual([{ id: 'note-1', title: 'Hello', body: '', at: 123 }]);
    mocks.nativeNotifications.callAsync.mockResolvedValueOnce(null);
    await Notifications.cancel('note-1');
    Notifications.addOpenedListener(() => {});
    expect(mocks.nativeNotifications.addListener).toHaveBeenCalledWith('opened', expect.any(Function));
  });
});
