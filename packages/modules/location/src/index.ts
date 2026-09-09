import {
  createNativeModule,
  type NativeModuleSubscription,
  type NativePermissionStatus,
} from '@stingjs/modules-core';

const nativeLocation = createNativeModule('Location');
const FOREGROUND_PERMISSION = 'foreground';

export type LocationPermissionStatus = NativePermissionStatus;

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface LocationPosition {
  coords: LocationCoordinates;
  timestamp: number;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizePosition(value: unknown): LocationPosition {
  if (!value || typeof value !== 'object') throw new TypeError('Location returned an invalid position.');
  const record = value as Record<string, unknown>;
  const coords = record.coords;
  if (!coords || typeof coords !== 'object') throw new TypeError('Location returned invalid coordinates.');
  const c = coords as Record<string, unknown>;
  return {
    coords: {
      latitude: number(c.latitude),
      longitude: number(c.longitude),
      altitude: nullableNumber(c.altitude),
      accuracy: number(c.accuracy),
      altitudeAccuracy: nullableNumber(c.altitudeAccuracy),
      heading: nullableNumber(c.heading),
      speed: nullableNumber(c.speed),
    },
    timestamp: number(record.timestamp),
  };
}

export const Location = {
  isAvailable(): boolean { return nativeLocation.isAvailable(); },
  getPermissionStatus(): LocationPermissionStatus { return nativeLocation.permissionStatus(FOREGROUND_PERMISSION); },
  requestPermission(): Promise<LocationPermissionStatus> { return nativeLocation.requestPermission(FOREGROUND_PERMISSION); },
  async getCurrentPosition(): Promise<LocationPosition> {
    return normalizePosition(await nativeLocation.callAsync('getCurrentPosition'));
  },
  watchPosition(listener: (position: LocationPosition) => void): NativeModuleSubscription {
    return nativeLocation.addListener('change', value => listener(normalizePosition(value)));
  },
};
