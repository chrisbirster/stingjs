import { createStingWorld, type StingWorld } from 'engine/ecs/world';
import type { Camera } from 'engine/Camera';
import type { GameTime, ImageAssets } from 'engine/types';

type DemoAssets = ImageAssets;

type DemoEffects = {
	flashBorder: () => void;
};

export type DemoWorld = StingWorld<DemoAssets, DemoEffects>;

type CreateDemoWorldOptions = {
	context: CanvasRenderingContext2D;
	time: GameTime;
	camera: Camera;
	logo: HTMLImageElement;
	flashBorder: () => void;
};

export function createDemoWorld({
	context,
	time,
	camera,
	logo,
	flashBorder,
}: CreateDemoWorldOptions): DemoWorld {
	return createStingWorld({
		context,
		time,
		camera,
		assets: {
			images: [logo],
		},
		effects: {
			flashBorder,
		},
	});
}
