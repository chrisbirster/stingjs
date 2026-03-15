import { addComponent, addEntity, createWorld, query, type World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import type { Dimensions } from 'engine/types';
import { Body } from '../components/Body';
import { BodyTouching } from '../components/BodyTouching';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
import { WorldBoundsBody } from '../components/WorldBoundsBody';
import { worldBoundsCollisionSystem } from './worldBoundsCollisionSystem';

type BoundsWorld = World<{
	bounds: Dimensions;
}>;

describe('worldBoundsCollisionSystem', () => {
	it('resolves bodies against world edges and flips velocity when bounce is enabled', () => {
		const world = createWorld({
			bounds: {
				width: 100,
				height: 80,
			},
		}) as BoundsWorld;
		const entityId = addEntity(world);

		addComponent(world, entityId, Position);
		addComponent(world, entityId, Velocity);
		addComponent(world, entityId, Body);
		addComponent(world, entityId, BodyTouching);
		addComponent(world, entityId, WorldBoundsBody);

		Position.x[entityId] = -12;
		Position.y[entityId] = 70;
		Velocity.x[entityId] = -32;
		Velocity.y[entityId] = 18;
		Body.width[entityId] = 24;
		Body.height[entityId] = 20;
		WorldBoundsBody.bounceX[entityId] = 1;
		WorldBoundsBody.bounceY[entityId] = 1;

		expect(
			Array.from(query(world, [Position, Velocity, Body, BodyTouching, WorldBoundsBody])),
		).toEqual([entityId]);

		worldBoundsCollisionSystem(world);

		expect(Position.x[entityId]).toBe(0);
		expect(Position.y[entityId]).toBe(60);
		expect(Velocity.x[entityId]).toBe(32);
		expect(Velocity.y[entityId]).toBe(-18);
		expect(BodyTouching.left[entityId]).toBe(1);
		expect(BodyTouching.bottom[entityId]).toBe(1);
	});
});
