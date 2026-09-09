import { createNativeModule } from '@stingjs/modules-core';

const nativeSecureStore = createNativeModule('SecureStore');

export interface SecureStoreOptions {
  namespace?: string;
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function namespace(options?: SecureStoreOptions): string {
  return requireNonEmpty(options?.namespace ?? 'default', 'SecureStore namespace');
}

export const SecureStore = {
  isAvailable(): boolean {
    return nativeSecureStore.isAvailable();
  },

  async getItem(key: string, options?: SecureStoreOptions): Promise<string | null> {
    const result = await nativeSecureStore.callAsync<string | null>(
      'getItem',
      [requireNonEmpty(key, 'SecureStore key'), namespace(options)],
    );
    return result ?? null;
  },

  async setItem(key: string, value: string, options?: SecureStoreOptions): Promise<void> {
    await nativeSecureStore.callAsync(
      'setItem',
      [
        requireNonEmpty(key, 'SecureStore key'),
        requireNonEmpty(value, 'SecureStore value'),
        namespace(options),
      ],
    );
  },

  async deleteItem(key: string, options?: SecureStoreOptions): Promise<void> {
    await nativeSecureStore.callAsync(
      'deleteItem',
      [requireNonEmpty(key, 'SecureStore key'), namespace(options)],
    );
  },

  async hasItem(key: string, options?: SecureStoreOptions): Promise<boolean> {
    return await nativeSecureStore.callAsync<boolean>(
      'hasItem',
      [requireNonEmpty(key, 'SecureStore key'), namespace(options)],
    ) === true;
  },
};
