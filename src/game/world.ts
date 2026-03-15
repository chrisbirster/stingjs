import { createStingWorld, type StingWorld } from 'engine/ecs/world';
import type { Camera } from 'engine/Camera';
import type { InputManager } from 'engine/input/InputManager';
import type { AssetCollections, Dimensions, GameTime } from 'engine/types';

type DemoAssets = AssetCollections;

type DemoEffects = {
	flashBorder: () => void;
};

export type DemoWorldBounds = Dimensions;
export type DemoWorld = StingWorld<DemoAssets, DemoEffects> & {
	bounds: DemoWorldBounds;
};

type CreateDemoWorldOptions = {
	context: CanvasRenderingContext2D;
	time: GameTime;
	camera: Camera;
	input: InputManager;
	assets: DemoAssets;
	bounds: DemoWorldBounds;
	flashBorder: () => void;
};

export function createDemoWorld({
	context,
	time,
	camera,
	input,
	assets,
	bounds,
	flashBorder,
}: CreateDemoWorldOptions): DemoWorld {
	const world = createStingWorld({
		context,
		time,
		camera,
		input,
		assets,
		effects: {
			flashBorder,
		},
	});

	return Object.assign(world, {
		bounds,
	});
}
