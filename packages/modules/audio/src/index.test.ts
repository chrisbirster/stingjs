import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const object = { callSync: vi.fn((method: string) => method === 'getId' ? 'player-1' : { state: 'ready', duration: 10, position: 1 }), callAsync: vi.fn(), dispose: vi.fn(), module: 'Audio', type: 'Player', disposed: false };
  const nativeAudio = { isAvailable: vi.fn(), createObject: vi.fn(() => object), addListener: vi.fn(() => ({ remove: vi.fn() })) };
  return { object, nativeAudio, createNativeModule: vi.fn(() => nativeAudio) };
});
vi.mock('@stingjs/modules-core', () => ({ createNativeModule: mocks.createNativeModule }));
import { Audio } from './index.js';

describe('Audio', () => {
  it('uses shared native objects for player lifetime', async () => {
    const player = Audio.createPlayer();
    expect(player.id).toBe('player-1');
    await player.load('file:///song.mp3');
    await player.play();
    expect(mocks.object.callAsync).toHaveBeenCalledWith('load', ['file:///song.mp3']);
    expect(mocks.object.callAsync).toHaveBeenCalledWith('play');
    player.dispose();
    expect(mocks.object.dispose).toHaveBeenCalled();
  });
});
