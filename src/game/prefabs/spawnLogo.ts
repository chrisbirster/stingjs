import { addComponent, addEntity } from 'bitecs';
import { AnimationPlayer } from 'engine/ecs/components/AnimationPlayer';
import { Body } from 'engine/ecs/components/Body';
import { BodyTouching } from 'engine/ecs/components/BodyTouching';
import { CameraTarget } from 'engine/ecs/components/CameraTarget';
import { MoveSpeed } from 'engine/ecs/components/MoveSpeed';
import { OverlapState } from 'engine/ecs/components/OverlapState';
import { PlayerInput } from 'engine/ecs/components/PlayerInput';
import { Position } from 'engine/ecs/components/Position';
import { Sprite } from 'engine/ecs/components/Sprite';
import { SpriteAsset } from 'engine/ecs/components/SpriteAsset';
import { SpriteFrame } from 'engine/ecs/components/SpriteFrame';
import { Velocity } from 'engine/ecs/components/Velocity';
import { WorldBoundsBody } from 'engine/ecs/components/WorldBoundsBody';
import { DemoAnimationAsset } from 'game/constants/assets';
import { LOGO_SPEED, SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import type { DemoWorld } from 'game/world';

const LOGO_MAX_WIDTH = SCREEN_WIDTH * 0.28;
const LOGO_MAX_HEIGHT = SCREEN_HEIGHT * 0.36;
const FALLBACK_IMAGE_SIZE = 256;

function getRenderSize(sourceWidth: number, sourceHeight: number): { width: number; height: number } {
	const scale = Math.min(
		LOGO_MAX_WIDTH / sourceWidth,
		LOGO_MAX_HEIGHT / sourceHeight,
		1,
	);

	return {
		width: Math.floor(sourceWidth * scale),
		height: Math.floor(sourceHeight * scale),
	};
}

export function spawnLogo(world: DemoWorld, x: number, y: number): number {
	const entityId = addEntity(world);
	const animation = world.assets.animations[DemoAnimationAsset.LOGO_IDLE];
	const initialStep = animation?.steps[0];

	if (!animation || !initialStep) {
		throw new Error('Unable to find logo animation asset');
	}

	const [, , sourceWidth = FALLBACK_IMAGE_SIZE, sourceHeight = FALLBACK_IMAGE_SIZE] = initialStep.frame;
	const { width, height } = getRenderSize(sourceWidth, sourceHeight);

	addComponent(world, entityId, Position);
	addComponent(world, entityId, AnimationPlayer);
	addComponent(world, entityId, Body);
	addComponent(world, entityId, BodyTouching);
	addComponent(world, entityId, CameraTarget);
	addComponent(world, entityId, PlayerInput);
	addComponent(world, entityId, OverlapState);
	addComponent(world, entityId, MoveSpeed);
	addComponent(world, entityId, Velocity);
	addComponent(world, entityId, Sprite);
	addComponent(world, entityId, SpriteAsset);
	addComponent(world, entityId, SpriteFrame);
	addComponent(world, entityId, WorldBoundsBody);

	Position.x[entityId] = x - width / 2;
	Position.y[entityId] = y - height / 2;
	AnimationPlayer.animation[entityId] = DemoAnimationAsset.LOGO_IDLE;
	AnimationPlayer.frame[entityId] = 0;
	AnimationPlayer.elapsed[entityId] = 0;
	AnimationPlayer.playing[entityId] = 1;
	Body.offsetX[entityId] = 0;
	Body.offsetY[entityId] = 0;
	Body.width[entityId] = width;
	Body.height[entityId] = height;
	BodyTouching.left[entityId] = 0;
	BodyTouching.right[entityId] = 0;
	BodyTouching.top[entityId] = 0;
	BodyTouching.bottom[entityId] = 0;
	CameraTarget.active[entityId] = 1;
	OverlapState.active[entityId] = 0;
	OverlapState.entered[entityId] = 0;
	OverlapState.exited[entityId] = 0;
	OverlapState.count[entityId] = 0;
	PlayerInput.playerId[entityId] = 0;
	MoveSpeed.value[entityId] = LOGO_SPEED;
	Velocity.x[entityId] = LOGO_SPEED;
	Velocity.y[entityId] = LOGO_SPEED;
	Sprite.width[entityId] = width;
	Sprite.height[entityId] = height;
	SpriteAsset.image[entityId] = animation.image;
	SpriteFrame.x[entityId] = initialStep.frame[0];
	SpriteFrame.y[entityId] = initialStep.frame[1];
	SpriteFrame.width[entityId] = sourceWidth;
	SpriteFrame.height[entityId] = sourceHeight;
	WorldBoundsBody.bounceX[entityId] = 1;
	WorldBoundsBody.bounceY[entityId] = 1;

	return entityId;
}
