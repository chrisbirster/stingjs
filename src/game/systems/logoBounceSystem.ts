import { query } from 'bitecs';
import { BodyTouching } from 'engine/ecs/components/BodyTouching';
import type { StingWorldSystem } from 'engine/ecs/world';
import type { DemoWorld } from 'game/world';

export const logoBounceSystem: StingWorldSystem<DemoWorld> = (world) => {
	for (const entityId of query(world, [BodyTouching])) {
		const didBounce = Boolean(
			BodyTouching.left[entityId]
			|| BodyTouching.right[entityId]
			|| BodyTouching.top[entityId]
			|| BodyTouching.bottom[entityId],
		);

		if (!didBounce) continue;

		world.effects.flashBorder();
		break;
	}

	return world;
};
