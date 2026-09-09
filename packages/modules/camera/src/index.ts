import { createNativeModule, type NativePermissionStatus } from '@stingjs/modules-core';
import { createNativeModuleView } from '@stingjs/solid';

const nativeCamera = createNativeModule('Camera');
const CAMERA_PERMISSION = 'camera';

export type CameraPermissionStatus = NativePermissionStatus;
export type CameraFacing = 'back' | 'front';
export interface CameraViewProps { facing?: CameraFacing; }
export interface CameraPhoto { uri: string; width: number; height: number; mimeType: 'image/jpeg'; }

function normalizePhoto(value: unknown): CameraPhoto {
  if (!value || typeof value !== 'object') throw new TypeError('Camera returned an invalid photo.');
  const record = value as Record<string, unknown>;
  if (typeof record.uri !== 'string') throw new TypeError('Camera photo is missing a URI.');
  return {
    uri: record.uri,
    width: typeof record.width === 'number' ? record.width : 0,
    height: typeof record.height === 'number' ? record.height : 0,
    mimeType: 'image/jpeg',
  };
}

export const CameraView = createNativeModuleView<CameraViewProps>('Camera', 'Preview');
export const Camera = {
  isAvailable(): boolean { return nativeCamera.isAvailable(); },
  getPermissionStatus(): CameraPermissionStatus { return nativeCamera.permissionStatus(CAMERA_PERMISSION); },
  requestPermission(): Promise<CameraPermissionStatus> { return nativeCamera.requestPermission(CAMERA_PERMISSION); },
  async capturePhoto(): Promise<CameraPhoto> { return normalizePhoto(await nativeCamera.callAsync('capturePhoto')); },
};
