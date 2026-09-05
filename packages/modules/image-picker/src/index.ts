import { createNativeModule } from '@stingjs/modules-core';

const nativeImagePicker = createNativeModule('ImagePicker');

export interface ImagePickerAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export type ImagePickerResult =
  | { canceled: true; asset: null }
  | { canceled: false; asset: ImagePickerAsset };

export const ImagePicker = {
  isAvailable(): boolean {
    return nativeImagePicker.isAvailable();
  },

  async pickImage(): Promise<ImagePickerResult> {
    return await nativeImagePicker.callAsync('pickImage') as unknown as ImagePickerResult;
  },
};
