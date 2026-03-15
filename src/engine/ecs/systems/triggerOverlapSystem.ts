import { query, type World } from 'bitecs';
import { bodiesOverlap } from '../collision';
import { Body } from '../components/Body';
import { OverlapState } from '../components/OverlapState';
import { Position } from '../components/Position';
import { TriggerBody } from '../components/TriggerBody';

export function triggerOverlapSystem<TWorld extends World>(world: TWorld): TWorld {
	const subjects = query(world, [Position, Body, OverlapState]);
	const triggers = query(world, [Position, Body, TriggerBody]);

	for (const entityId of subjects) {
		const wasActive = OverlapState.active[entityId] === 1;

		OverlapState.active[entityId] = 0;
		OverlapState.entered[entityId] = 0;
		OverlapState.exited[entityId] = 0;
		OverlapState.count[entityId] = 0;

		for (const triggerId of triggers) {
			if (triggerId === entityId) continue;
			if (!bodiesOverlap(entityId, triggerId)) continue;

			OverlapState.active[entityId] = 1;
			OverlapState.count[entityId] += 1;
		}

		const isActive = OverlapState.active[entityId] === 1;

		if (isActive && !wasActive) {
			OverlapState.entered[entityId] = 1;
		}

		if (!isActive && wasActive) {
			OverlapState.exited[entityId] = 1;
		}
	}

	return world;
}
