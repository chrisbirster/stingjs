import { createNativeModule, type NativeModuleSubscription } from '@stingjs/modules-core';

export type NetworkType = 'none' | 'wifi' | 'cellular' | 'ethernet' | 'other';

export interface NetworkState {
  connected: boolean;
  internetReachable: boolean | null;
  type: NetworkType;
  expensive: boolean;
}

const nativeNetwork = createNativeModule('Network');

export const Network = {
  isAvailable(): boolean {
    return nativeNetwork.isAvailable();
  },

  async getState(): Promise<NetworkState> {
    return await nativeNetwork.callAsync('getState') as unknown as NetworkState;
  },

  addNetworkStateListener(listener: (state: NetworkState) => void): NativeModuleSubscription {
    return nativeNetwork.addListener('change', payload => {
      listener(payload as unknown as NetworkState);
    });
  },
};
