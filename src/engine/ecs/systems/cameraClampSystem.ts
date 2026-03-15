import type { World } from 'bitecs';
import type { Camera } from '../../Camera';
import type { Dimensions } from '../../types';

type CameraClampWorld = World<{
	camera: Camera;
	context: CanvasRenderingContext2D;
	bounds: Dimensions;
}>;

export function cameraClampSystem<TWorld extends CameraClampWorld>(world: TWorld): TWorld {
	const maxX = Math.max(0, world.bounds.width - world.context.canvas.width);
	const maxY = Math.max(0, world.bounds.height - world.context.canvas.height);

	world.camera.position.x = Math.min(Math.max(0, world.camera.position.x), maxX);
	world.camera.position.y = Math.min(Math.max(0, world.camera.position.y), maxY);

	return world;
}
