import { query, type World } from 'bitecs';
import type { AnimationAssets, GameTime, SpriteAnimation, SpriteAnimationStep } from '../../types';
import { AnimationPlayer } from '../components/AnimationPlayer';
import { SpriteAsset } from '../components/SpriteAsset';
import { SpriteFrame } from '../components/SpriteFrame';

type AnimationWorld = World<{
	time: GameTime;
	assets: AnimationAssets;
}>;

function applyAnimationStep(
	entityId: number,
	animation: SpriteAnimation,
	step: SpriteAnimationStep,
): void {
	const [sourceX, sourceY, sourceWidth, sourceHeight] = step.frame;

	SpriteAsset.image[entityId] = animation.image;
	SpriteFrame.x[entityId] = sourceX;
	SpriteFrame.y[entityId] = sourceY;
	SpriteFrame.width[entityId] = sourceWidth;
	SpriteFrame.height[entityId] = sourceHeight;
}

export function animationSystem<TWorld extends AnimationWorld>(world: TWorld): TWorld {
	for (const entityId of query(world, [AnimationPlayer, SpriteAsset, SpriteFrame])) {
		const animation = world.assets.animations[AnimationPlayer.animation[entityId]];

		if (!animation || animation.steps.length === 0) continue;

		let frameIndex = Math.min(AnimationPlayer.frame[entityId], animation.steps.length - 1);
		let elapsed = AnimationPlayer.elapsed[entityId];

		if (AnimationPlayer.playing[entityId]) {
			elapsed += world.time.secondsPassed;

			while (animation.steps[frameIndex].duration > 0 && elapsed >= animation.steps[frameIndex].duration) {
				elapsed -= animation.steps[frameIndex].duration;
				frameIndex += 1;

				if (frameIndex < animation.steps.length) continue;

				if (animation.loop === false) {
					frameIndex = animation.steps.length - 1;
					AnimationPlayer.playing[entityId] = 0;
					elapsed = 0;
					break;
				}

				frameIndex = 0;
			}

			AnimationPlayer.frame[entityId] = frameIndex;
			AnimationPlayer.elapsed[entityId] = elapsed;
		}

		applyAnimationStep(entityId, animation, animation.steps[frameIndex]);
	}

	return world;
}
