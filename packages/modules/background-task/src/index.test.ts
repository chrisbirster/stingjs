import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const nativeBackgroundTask = { isAvailable: vi.fn(), callAsync: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) };
  return { nativeBackgroundTask, createNativeModule: vi.fn(() => nativeBackgroundTask) };
});
vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
import { BackgroundTask } from './index.js';

describe('BackgroundTask', () => {
  it('registers named host-routed work', async () => {
    mocks.nativeBackgroundTask.callAsync.mockResolvedValue(null);
    await BackgroundTask.register('refresh');
    expect(mocks.nativeBackgroundTask.callAsync).toHaveBeenCalledWith('register', ['refresh']);
  });
  it('subscribes to portable run events', () => {
    const listener = vi.fn();
    BackgroundTask.addRunListener(listener);
    const callback = mocks.nativeBackgroundTask.addListener.mock.calls[0]?.[1];
    callback({ name: 'refresh', payload: { source: 'host' } });
    expect(listener).toHaveBeenCalledWith({ name: 'refresh', payload: { source: 'host' } });
  });
});
