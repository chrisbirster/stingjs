import { createNativeModule, type NativeModuleSubscription } from '@stingjs/modules-core';

export type SensorType = 'accelerometer' | 'gyroscope';

export interface SensorReading {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

const nativeSensors = createNativeModule('Sensors');

function requireSensorType(type: SensorType): SensorType {
  if (type !== 'accelerometer' && type !== 'gyroscope') {
    throw new TypeError(`Unsupported sensor type: ${String(type)}`);
  }
  return type;
}

function requireInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError('Sensor update interval must be a positive finite number of milliseconds');
  }
  return intervalMs;
}

function addListener(
  type: SensorType,
  listener: (reading: SensorReading) => void,
): NativeModuleSubscription {
  const event = requireSensorType(type);
  return nativeSensors.addListener(event, payload => {
    listener(payload as unknown as SensorReading);
  });
}

export const Sensors = {
  isAvailable(): boolean {
    return nativeSensors.isAvailable();
  },

  hasSensor(type: SensorType): boolean {
    return nativeSensors.callSync<boolean>('hasSensor', [requireSensorType(type)]) === true;
  },

  setUpdateInterval(type: SensorType, intervalMs: number): void {
    nativeSensors.callSync('setUpdateInterval', [requireSensorType(type), requireInterval(intervalMs)]);
  },

  addAccelerometerListener(listener: (reading: SensorReading) => void): NativeModuleSubscription {
    return addListener('accelerometer', listener);
  },

  addGyroscopeListener(listener: (reading: SensorReading) => void): NativeModuleSubscription {
    return addListener('gyroscope', listener);
  },
};
