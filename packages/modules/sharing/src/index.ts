import { createNativeModule } from '@stingjs/modules-core';

const nativeSharing = createNativeModule('Sharing');

export interface ShareContent {
  text?: string;
  url?: string;
  subject?: string;
}

export const Sharing = {
  isAvailable(): boolean {
    return nativeSharing.isAvailable();
  },

  async share(content: ShareContent): Promise<void> {
    const text = content.text ?? '';
    const url = content.url ?? '';
    const subject = content.subject ?? '';
    if (text.length === 0 && url.length === 0) {
      throw new TypeError('Sharing.share requires text or url');
    }
    await nativeSharing.callAsync('share', [text, url, subject]);
  },
};
