import type { World } from 'bitecs';
import type { StingWorldSystem } from './world';

export function pipeSystems<TWorld extends World>(
	...systems: StingWorldSystem<TWorld>[]
): StingWorldSystem<TWorld> {
	return (world: TWorld): TWorld => {
		let nextWorld = world;

		for (const system of systems) {
			nextWorld = system(nextWorld);
		}

		return nextWorld;
	};
}
