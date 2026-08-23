import { getHost } from '@stingjs/core';

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

export const Haptics = {
  impact(style: ImpactStyle = 'medium'): void {
    getHost().callModuleSync('Haptics', 'impact', [style]);
  },
};
