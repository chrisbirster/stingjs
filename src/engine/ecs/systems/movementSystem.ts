import { query, type World } from 'bitecs';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
import type { GameTime } from '../../types';

type TimedWorld = World<{
	time: GameTime;
}>;

export function movementSystem<TWorld extends TimedWorld>(world: TWorld): TWorld {
	for (const entityId of query(world, [Position, Velocity])) {
		Position.x[entityId] += Velocity.x[entityId] * world.time.secondsPassed;
		Position.y[entityId] += Velocity.y[entityId] * world.time.secondsPassed;
	}

	return world;
}
