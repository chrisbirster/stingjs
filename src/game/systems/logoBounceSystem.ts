import { query } from 'bitecs';
import { Position } from 'engine/ecs/components/Position';
import { Sprite } from 'engine/ecs/components/Sprite';
import { Velocity } from 'engine/ecs/components/Velocity';
import type { StingWorldSystem } from 'engine/ecs/world';
import { LOGO_SPEED } from 'game/constants/game';
import type { DemoWorld } from 'game/world';

export const logoBounceSystem: StingWorldSystem<DemoWorld> = (world) => {
	for (const entityId of query(world, [Position, Velocity, Sprite])) {
		let didBounce = false;
		const maxX = world.bounds.width - Sprite.width[entityId];
		const maxY = world.bounds.height - Sprite.height[entityId];

		if (Position.x[entityId] < 0) {
			Position.x[entityId] = 0;
			Velocity.x[entityId] = Math.abs(LOGO_SPEED);
			didBounce = true;
		}

		if (Position.y[entityId] < 0) {
			Position.y[entityId] = 0;
			Velocity.y[entityId] = Math.abs(LOGO_SPEED);
			didBounce = true;
		}

		if (Position.x[entityId] > maxX) {
			Position.x[entityId] = maxX;
			Velocity.x[entityId] = -Math.abs(LOGO_SPEED);
			didBounce = true;
		}

		if (Position.y[entityId] > maxY) {
			Position.y[entityId] = maxY;
			Velocity.y[entityId] = -Math.abs(LOGO_SPEED);
			didBounce = true;
		}

		if (didBounce) {
			world.effects.flashBorder();
		}
	}

	return world;
};
