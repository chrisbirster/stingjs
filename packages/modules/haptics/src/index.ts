import { createNativeModule } from '@stingjs/modules-core';

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

const nativeHaptics = createNativeModule('Haptics');

export const Haptics = {
  isAvailable(): boolean {
    return nativeHaptics.isAvailable();
  },

  impact(style: ImpactStyle = 'medium'): void {
    nativeHaptics.callSync('impact', [style]);
  },
};
