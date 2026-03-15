import { query, type World } from 'bitecs';
import type { Camera } from '../../Camera';
import type { Dimensions } from '../../types';
import { CameraTarget } from '../components/CameraTarget';
import { Position } from '../components/Position';
import { Sprite } from '../components/Sprite';

type CameraFollowWorld = World<{
	camera: Camera;
	context: CanvasRenderingContext2D;
	bounds: Dimensions;
}>;

export function cameraFollowSystem<TWorld extends CameraFollowWorld>(world: TWorld): TWorld {
	const [targetId] = query(world, [Position, Sprite, CameraTarget]);

	if (targetId === undefined) {
		return world;
	}

	const viewportWidth = world.context.canvas.width;
	const viewportHeight = world.context.canvas.height;
	const targetCenterX = Position.x[targetId] + Sprite.width[targetId] / 2;
	const targetCenterY = Position.y[targetId] + Sprite.height[targetId] / 2;

	world.camera.position.x = targetCenterX - viewportWidth / 2;
	world.camera.position.y = targetCenterY - viewportHeight / 2;

	return world;
}
