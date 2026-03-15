import { addComponent, addEntity, createWorld, type World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import type { AnimationAssets, GameTime } from 'engine/types';
import { AnimationPlayer } from '../components/AnimationPlayer';
import { SpriteAsset } from '../components/SpriteAsset';
import { SpriteFrame } from '../components/SpriteFrame';
import { animationSystem } from './animationSystem';

type AnimationTestWorld = World<{
	time: GameTime;
	assets: AnimationAssets;
}>;

describe('animationSystem', () => {
	it('advances frames and writes the current sprite frame data', () => {
		const world = createWorld({
			time: {
				previous: 0,
				secondsPassed: 0.15,
			},
			assets: {
				animations: [
					{
						image: 3,
						steps: [
							{ frame: [0, 0, 16, 16], duration: 0.1 },
							{ frame: [16, 0, 16, 16], duration: 0.1 },
						],
					},
				],
			},
		}) as AnimationTestWorld;
		const entityId = addEntity(world);

		addComponent(world, entityId, AnimationPlayer);
		addComponent(world, entityId, SpriteAsset);
		addComponent(world, entityId, SpriteFrame);

		AnimationPlayer.animation[entityId] = 0;
		AnimationPlayer.frame[entityId] = 0;
		AnimationPlayer.elapsed[entityId] = 0;
		AnimationPlayer.playing[entityId] = 1;

		animationSystem(world);

		expect(AnimationPlayer.frame[entityId]).toBe(1);
		expect(SpriteAsset.image[entityId]).toBe(3);
		expect(SpriteFrame.x[entityId]).toBe(16);
		expect(SpriteFrame.width[entityId]).toBe(16);
	});
});
