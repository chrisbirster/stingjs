import { query } from 'bitecs';
import { GamepadThumbstick } from 'engine/constants/control';
import { MoveSpeed } from 'engine/ecs/components/MoveSpeed';
import { PlayerInput } from 'engine/ecs/components/PlayerInput';
import { Velocity } from 'engine/ecs/components/Velocity';
import type { StingWorldSystem } from 'engine/ecs/world';
import { Control } from 'game/constants/controls';
import type { DemoWorld } from 'game/world';

export const logoInputSystem: StingWorldSystem<DemoWorld> = (world) => {
	for (const entityId of query(world, [Velocity, MoveSpeed, PlayerInput])) {
		const playerId = PlayerInput.playerId[entityId];
		const baseSpeed = MoveSpeed.value[entityId];
		const boostMultiplier = world.input.isControlDown(playerId, Control.ACTION) ? 2 : 1;
		const speed = baseSpeed * boostMultiplier;

		const left = world.input.isControlDown(playerId, Control.LEFT)
			|| world.input.isNegativeAxis(playerId, GamepadThumbstick.HORIZONTAL_AXE_ID);
		const right = world.input.isControlDown(playerId, Control.RIGHT)
			|| world.input.isPositiveAxis(playerId, GamepadThumbstick.HORIZONTAL_AXE_ID);
		const up = world.input.isControlDown(playerId, Control.UP)
			|| world.input.isNegativeAxis(playerId, GamepadThumbstick.VERTICAL_AXE_ID);
		const down = world.input.isControlDown(playerId, Control.DOWN)
			|| world.input.isPositiveAxis(playerId, GamepadThumbstick.VERTICAL_AXE_ID);

		if (left !== right) {
			Velocity.x[entityId] = left ? -speed : speed;
		} else if (boostMultiplier > 1) {
			Velocity.x[entityId] = Math.sign(Velocity.x[entityId] || 1) * speed;
		}

		if (up !== down) {
			Velocity.y[entityId] = up ? -speed : speed;
		} else if (boostMultiplier > 1) {
			Velocity.y[entityId] = Math.sign(Velocity.y[entityId] || 1) * speed;
		}
	}

	return world;
};
