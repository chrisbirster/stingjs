import { createNativeModule } from '@stingjs/modules-core';

const nativeClipboard = createNativeModule('Clipboard');

export const Clipboard = {
  isAvailable(): boolean {
    return nativeClipboard.isAvailable();
  },

  getString(): string {
    return nativeClipboard.callSync<string>('getString') ?? '';
  },

  setString(value: string): void {
    nativeClipboard.callSync('setString', [value]);
  },

  hasString(): boolean {
    return nativeClipboard.callSync<boolean>('hasString') === true;
  },

  clear(): void {
    nativeClipboard.callSync('clear');
  },
};
