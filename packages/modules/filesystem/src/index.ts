import { createNativeModule } from '@stingjs/modules-core';

export type FilesystemDirectory = 'documents' | 'cache';

export interface FilesystemPathOptions {
  directory?: FilesystemDirectory;
}

export interface FilesystemInfo {
  exists: boolean;
  type: 'file' | 'directory' | null;
  size: number;
  modifiedAt: number | null;
}

const nativeFilesystem = createNativeModule('Filesystem');

function directory(options?: FilesystemPathOptions): FilesystemDirectory {
  return options?.directory ?? 'documents';
}

export const Filesystem = {
  isAvailable(): boolean {
    return nativeFilesystem.isAvailable();
  },

  async readText(path: string, options?: FilesystemPathOptions): Promise<string> {
    return (await nativeFilesystem.callAsync<string>('readText', [path, directory(options)])) ?? '';
  },

  async writeText(
    path: string,
    contents: string,
    options?: FilesystemPathOptions,
  ): Promise<void> {
    await nativeFilesystem.callAsync('writeText', [path, contents, directory(options)]);
  },

  async delete(path: string, options?: FilesystemPathOptions): Promise<void> {
    await nativeFilesystem.callAsync('delete', [path, directory(options)]);
  },

  async makeDirectory(path: string, options?: FilesystemPathOptions): Promise<void> {
    await nativeFilesystem.callAsync('makeDirectory', [path, directory(options)]);
  },

  async getInfo(path: string, options?: FilesystemPathOptions): Promise<FilesystemInfo> {
    return await nativeFilesystem.callAsync('getInfo', [path, directory(options)]) as unknown as FilesystemInfo;
  },
};
