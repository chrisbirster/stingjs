import { addComponent, addEntity, createWorld, query, type World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { bodiesOverlap } from '../collision';
import { Body } from '../components/Body';
import { OverlapState } from '../components/OverlapState';
import { Position } from '../components/Position';
import { TriggerBody } from '../components/TriggerBody';
import { triggerOverlapSystem } from './triggerOverlapSystem';

describe('triggerOverlapSystem', () => {
	it('tracks active, entered, and exited overlap state against trigger bodies', () => {
		const world = createWorld({}) as World;
		const actorId = addEntity(world);
		const triggerId = addEntity(world);

		addComponent(world, actorId, Position);
		addComponent(world, actorId, Body);
		addComponent(world, actorId, OverlapState);
		addComponent(world, triggerId, Position);
		addComponent(world, triggerId, Body);
		addComponent(world, triggerId, TriggerBody);

		Position.x[actorId] = 16;
		Position.y[actorId] = 16;
		Body.width[actorId] = 32;
		Body.height[actorId] = 32;
		Position.x[triggerId] = 32;
		Position.y[triggerId] = 32;
		Body.width[triggerId] = 48;
		Body.height[triggerId] = 48;

		expect(Array.from(query(world, [Position, Body, OverlapState]))).toEqual([actorId]);
		expect(Array.from(query(world, [Position, Body, TriggerBody]))).toEqual([triggerId]);
		expect(bodiesOverlap(actorId, triggerId)).toBe(true);

		triggerOverlapSystem(world);

		expect(OverlapState.active[actorId]).toBe(1);
		expect(OverlapState.entered[actorId]).toBe(1);
		expect(OverlapState.exited[actorId]).toBe(0);
		expect(OverlapState.count[actorId]).toBe(1);

		Position.x[actorId] = 200;
		Position.y[actorId] = 200;

		triggerOverlapSystem(world);

		expect(OverlapState.active[actorId]).toBe(0);
		expect(OverlapState.entered[actorId]).toBe(0);
		expect(OverlapState.exited[actorId]).toBe(1);
		expect(OverlapState.count[actorId]).toBe(0);
	});
});
