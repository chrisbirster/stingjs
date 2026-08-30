import { createNativeModule, type NativeModuleObject, type NativeModuleSubscription } from '@stingjs/modules-core';

const nativeAudio = createNativeModule('Audio');
export type AudioPlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
export interface AudioPlayerStatus { state: AudioPlayerState; duration: number | null; position: number; }
export interface AudioPlayerStateEvent extends AudioPlayerStatus { id: string; }

function normalizeStatus(value: unknown): AudioPlayerStatus {
  if (!value || typeof value !== 'object') throw new TypeError('Audio returned invalid player status.');
  const record = value as Record<string, unknown>;
  const state = typeof record.state === 'string' ? record.state as AudioPlayerState : 'error';
  return { state, duration: typeof record.duration === 'number' && Number.isFinite(record.duration) ? record.duration : null, position: typeof record.position === 'number' && Number.isFinite(record.position) ? record.position : 0 };
}

export class AudioPlayer {
  readonly id: string;
  constructor(private readonly object: NativeModuleObject<'Audio'>) { this.id = object.callSync<string>('getId'); }
  async load(uri: string): Promise<void> { if (!uri.trim()) throw new TypeError('Audio URI must not be empty.'); await this.object.callAsync('load', [uri]); }
  async play(): Promise<void> { await this.object.callAsync('play'); }
  async pause(): Promise<void> { await this.object.callAsync('pause'); }
  async seek(position: number): Promise<void> { await this.object.callAsync('seek', [Math.max(0, position)]); }
  async stop(): Promise<void> { await this.object.callAsync('stop'); }
  getStatus(): AudioPlayerStatus { return normalizeStatus(this.object.callSync('getStatus')); }
  addStateListener(listener: (status: AudioPlayerStatus) => void): NativeModuleSubscription {
    return nativeAudio.addListener('stateChange', value => {
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record.id === this.id) listener(normalizeStatus(record));
    });
  }
  dispose(): void { this.object.dispose(); }
}

export const Audio = {
  isAvailable(): boolean { return nativeAudio.isAvailable(); },
  createPlayer(): AudioPlayer { return new AudioPlayer(nativeAudio.createObject('Player')); },
};
