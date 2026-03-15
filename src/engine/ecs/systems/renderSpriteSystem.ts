import { query, type World } from 'bitecs';
import type { ImageAssets } from '../../types';
import { Position } from '../components/Position';
import { Sprite } from '../components/Sprite';
import { SpriteAsset } from '../components/SpriteAsset';
import type { Camera } from '../../Camera';

type SpriteRenderWorld = World<{
	context: CanvasRenderingContext2D;
	assets: ImageAssets;
	camera: Camera;
}>;

export function renderSpriteSystem<TWorld extends SpriteRenderWorld>(world: TWorld): TWorld {
	for (const entityId of query(world, [Position, Sprite, SpriteAsset])) {
		const image = world.assets.images[SpriteAsset.image[entityId]];

		if (!(image instanceof HTMLImageElement)) continue;

		world.context.drawImage(
			image,
			Math.floor(Position.x[entityId] - world.camera.position.x),
			Math.floor(Position.y[entityId] - world.camera.position.y),
			Sprite.width[entityId],
			Sprite.height[entityId],
		);
	}

	return world;
}
