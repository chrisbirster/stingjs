import { createNativeModule, type NativeModuleSubscription } from '@stingjs/modules-core';

const nativeBackgroundTask = createNativeModule('BackgroundTask');
export interface BackgroundTaskEvent { name: string; payload: unknown; }

function requireName(name: string): string {
  const value = name.trim();
  if (!value) throw new TypeError('Background task name must not be empty.');
  return value;
}

export const BackgroundTask = {
  isAvailable(): boolean { return nativeBackgroundTask.isAvailable(); },
  async register(name: string): Promise<void> { await nativeBackgroundTask.callAsync('register', [requireName(name)]); },
  async unregister(name: string): Promise<void> { await nativeBackgroundTask.callAsync('unregister', [requireName(name)]); },
  async getRegistered(): Promise<string[]> {
    const value = await nativeBackgroundTask.callAsync('getRegistered');
    if (!Array.isArray(value)) throw new TypeError('BackgroundTask returned an invalid registration list.');
    return value.filter((item): item is string => typeof item === 'string');
  },
  addRunListener(listener: (event: BackgroundTaskEvent) => void): NativeModuleSubscription {
    return nativeBackgroundTask.addListener('run', value => {
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record.name === 'string') listener({ name: record.name, payload: record.payload });
    });
  },
};
