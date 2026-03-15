import { query, type World } from 'bitecs';
import type { Dimensions } from '../../types';
import { getBodyRect } from '../collision';
import { Body } from '../components/Body';
import { BodyTouching } from '../components/BodyTouching';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
import { WorldBoundsBody } from '../components/WorldBoundsBody';

type WorldBoundsCollisionWorld = World<{
	bounds: Dimensions;
}>;

function resetTouching(entityId: number): void {
	BodyTouching.left[entityId] = 0;
	BodyTouching.right[entityId] = 0;
	BodyTouching.top[entityId] = 0;
	BodyTouching.bottom[entityId] = 0;
}

export function worldBoundsCollisionSystem<TWorld extends WorldBoundsCollisionWorld>(world: TWorld): TWorld {
	for (const entityId of query(world, [Position, Velocity, Body, BodyTouching, WorldBoundsBody])) {
		resetTouching(entityId);

		const body = getBodyRect(entityId);
		const offsetX = Body.offsetX[entityId] ?? 0;
		const offsetY = Body.offsetY[entityId] ?? 0;
		const width = Body.width[entityId] ?? 0;
		const height = Body.height[entityId] ?? 0;
		const minX = offsetX === 0 ? 0 : -offsetX;
		const minY = offsetY === 0 ? 0 : -offsetY;
		const maxX = world.bounds.width - width - offsetX;
		const maxY = world.bounds.height - height - offsetY;

		if (body.x < 0) {
			Position.x[entityId] = minX;
			Velocity.x[entityId] = WorldBoundsBody.bounceX[entityId] ? Math.abs(Velocity.x[entityId]) : 0;
			BodyTouching.left[entityId] = 1;
		}

		if (body.y < 0) {
			Position.y[entityId] = minY;
			Velocity.y[entityId] = WorldBoundsBody.bounceY[entityId] ? Math.abs(Velocity.y[entityId]) : 0;
			BodyTouching.top[entityId] = 1;
		}

		if (body.x + body.width > world.bounds.width) {
			Position.x[entityId] = maxX;
			Velocity.x[entityId] = WorldBoundsBody.bounceX[entityId] ? -Math.abs(Velocity.x[entityId]) : 0;
			BodyTouching.right[entityId] = 1;
		}

		if (body.y + body.height > world.bounds.height) {
			Position.y[entityId] = maxY;
			Velocity.y[entityId] = WorldBoundsBody.bounceY[entityId] ? -Math.abs(Velocity.y[entityId]) : 0;
			BodyTouching.bottom[entityId] = 1;
		}
	}

	return world;
}
