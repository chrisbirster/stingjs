import { addComponent, addEntity } from 'bitecs';
import { CameraTarget } from 'engine/ecs/components/CameraTarget';
import { MoveSpeed } from 'engine/ecs/components/MoveSpeed';
import { PlayerInput } from 'engine/ecs/components/PlayerInput';
import { Position } from 'engine/ecs/components/Position';
import { Sprite } from 'engine/ecs/components/Sprite';
import { SpriteAsset } from 'engine/ecs/components/SpriteAsset';
import { Velocity } from 'engine/ecs/components/Velocity';
import { DemoImageAsset } from 'game/constants/assets';
import { LOGO_SPEED, SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import type { DemoWorld } from 'game/world';

const LOGO_MAX_WIDTH = SCREEN_WIDTH * 0.28;
const LOGO_MAX_HEIGHT = SCREEN_HEIGHT * 0.36;
const FALLBACK_IMAGE_SIZE = 256;

function getRenderSize(image: HTMLImageElement): { width: number; height: number } {
	const sourceWidth = image.naturalWidth || image.width || FALLBACK_IMAGE_SIZE;
	const sourceHeight = image.naturalHeight || image.height || FALLBACK_IMAGE_SIZE;
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
	const image = world.assets.images[DemoImageAsset.LOGO];

	if (!(image instanceof HTMLImageElement)) {
		throw new Error('Unable to find logo image asset');
	}

	const { width, height } = getRenderSize(image);

	addComponent(world, entityId, Position);
	addComponent(world, entityId, CameraTarget);
	addComponent(world, entityId, PlayerInput);
	addComponent(world, entityId, MoveSpeed);
	addComponent(world, entityId, Velocity);
	addComponent(world, entityId, Sprite);
	addComponent(world, entityId, SpriteAsset);

	Position.x[entityId] = x - width / 2;
	Position.y[entityId] = y - height / 2;
	CameraTarget.active[entityId] = 1;
	PlayerInput.playerId[entityId] = 0;
	MoveSpeed.value[entityId] = LOGO_SPEED;
	Velocity.x[entityId] = LOGO_SPEED;
	Velocity.y[entityId] = LOGO_SPEED;
	Sprite.width[entityId] = width;
	Sprite.height[entityId] = height;
	SpriteAsset.image[entityId] = DemoImageAsset.LOGO;

	return entityId;
}
