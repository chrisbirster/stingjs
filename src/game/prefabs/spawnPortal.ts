import { addComponent, addEntity } from 'bitecs';
import { Body } from 'engine/ecs/components/Body';
import { Position } from 'engine/ecs/components/Position';
import { TriggerBody } from 'engine/ecs/components/TriggerBody';
import type { DemoWorld } from 'game/world';

export function spawnPortal(
	world: DemoWorld,
	x: number,
	y: number,
	width: number,
	height: number,
): number {
	const entityId = addEntity(world);

	addComponent(world, entityId, Position);
	addComponent(world, entityId, Body);
	addComponent(world, entityId, TriggerBody);

	Position.x[entityId] = x;
	Position.y[entityId] = y;
	Body.offsetX[entityId] = 0;
	Body.offsetY[entityId] = 0;
	Body.width[entityId] = width;
	Body.height[entityId] = height;
	TriggerBody.active[entityId] = 1;

	return entityId;
}
