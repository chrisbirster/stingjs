import { query, type World } from 'bitecs';
import type { ImageAssets } from '../../types';
import { Position } from '../components/Position';
import { Sprite } from '../components/Sprite';
import { SpriteAsset } from '../components/SpriteAsset';
import { SpriteFrame } from '../components/SpriteFrame';
import type { Camera } from '../../Camera';

type SpriteRenderWorld = World<{
	context: CanvasRenderingContext2D;
	assets: ImageAssets;
	camera: Camera;
}>;

export function renderSpriteSystem<TWorld extends SpriteRenderWorld>(world: TWorld): TWorld {
	for (const entityId of query(world, [Position, Sprite, SpriteAsset])) {
		const image = world.assets.images[SpriteAsset.image[entityId]];
		const sourceWidth = SpriteFrame.width[entityId];
		const sourceHeight = SpriteFrame.height[entityId];
		const drawX = Math.floor(Position.x[entityId] - world.camera.position.x);
		const drawY = Math.floor(Position.y[entityId] - world.camera.position.y);

		if (!(image instanceof HTMLImageElement)) continue;

		if (sourceWidth > 0 && sourceHeight > 0) {
			world.context.drawImage(
				image,
				SpriteFrame.x[entityId],
				SpriteFrame.y[entityId],
				sourceWidth,
				sourceHeight,
				drawX,
				drawY,
				Sprite.width[entityId],
				Sprite.height[entityId],
			);
			continue;
		}

		world.context.drawImage(image, drawX, drawY, Sprite.width[entityId], Sprite.height[entityId]);
	}

	return world;
}
