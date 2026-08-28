import { createNativeModule } from '@stingjs/modules-core';

export interface DeviceInfo {
  platform: 'ios' | 'android';
  model: string;
  manufacturer: string;
  osName: string;
  osVersion: string;
  isPhysicalDevice: boolean;
}

const nativeDevice = createNativeModule('Device');

export const Device = {
  isAvailable(): boolean {
    return nativeDevice.isAvailable();
  },

  getInfo(): DeviceInfo {
    return nativeDevice.callSync('getInfo') as unknown as DeviceInfo;
  },
};
