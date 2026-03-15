import { query } from 'bitecs';
import { Position } from 'engine/ecs/components/Position';
import { Sprite } from 'engine/ecs/components/Sprite';
import type { StingWorldSystem } from 'engine/ecs/world';
import type { DemoWorld } from 'game/world';

export const renderLogoSystem: StingWorldSystem<DemoWorld> = (world) => {
	for (const entityId of query(world, [Position, Sprite])) {
		world.context.drawImage(
			world.assets.logo,
			Math.floor(Position.x[entityId]),
			Math.floor(Position.y[entityId]),
			Sprite.width[entityId],
			Sprite.height[entityId],
		);
	}

	return world;
};
