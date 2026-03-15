import { createWorld, type World } from 'bitecs';
import type { Camera } from '../Camera';
import type { GameTime } from '../types';

type StingWorldResources = {
	context: CanvasRenderingContext2D;
	time: GameTime;
	camera: Camera;
};

export type StingWorld<
	TAssets extends object = Record<string, never>,
	TEffects extends object = Record<string, never>,
> = World & StingWorldResources & {
	assets: TAssets;
	effects: TEffects;
};

type CreateStingWorldOptions<TAssets extends object, TEffects extends object> = StingWorldResources & {
	assets: TAssets;
	effects: TEffects;
};

export type StingWorldSystem<TWorld extends World> = (world: TWorld) => TWorld;

export function createStingWorld<TAssets extends object, TEffects extends object>(
	options: CreateStingWorldOptions<TAssets, TEffects>,
): StingWorld<TAssets, TEffects> {
	return createWorld(options) as StingWorld<TAssets, TEffects>;
}
