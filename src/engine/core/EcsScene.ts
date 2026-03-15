import type { World } from 'bitecs';
import type { Camera } from '../Camera';
import type { InputManager } from '../input/InputManager';
import type { AssetCollections, GameTime } from '../types';
import { Scene } from './Scene';

export type EcsSceneWorldResources = {
	context: CanvasRenderingContext2D;
	time: GameTime;
	camera: Camera;
	input: InputManager;
	assets: AssetCollections;
};

export type CreateEcsSceneWorldOptions = EcsSceneWorldResources;

export abstract class EcsScene<TWorld extends World<EcsSceneWorldResources>> extends Scene {
	world: TWorld | null = null;

	protected abstract createWorld(options: CreateEcsSceneWorldOptions): TWorld;

	protected onEnterWorld(world: TWorld): void {
		void world;
	}

	protected beforeUpdate(world: TWorld): void {
		void world;
	}

	protected updatePipeline(world: TWorld): TWorld {
		return world;
	}

	protected afterUpdate(world: TWorld): void {
		void world;
	}

	protected beforeDraw(world: TWorld): void {
		void world;
	}

	protected drawPipeline(world: TWorld): TWorld {
		return world;
	}

	protected afterDraw(world: TWorld): void {
		void world;
	}

	protected onExitWorld(world: TWorld): void {
		void world;
	}

	private syncWorld(world: TWorld, options: CreateEcsSceneWorldOptions): TWorld {
		world.time = options.time;
		world.context = options.context;
		world.camera = options.camera;
		world.input = options.input;
		world.assets = options.assets;

		return world;
	}

	protected getOrCreateWorld(options: CreateEcsSceneWorldOptions): TWorld {
		if (!this.world) {
			this.world = this.createWorld(options);
		}

		return this.syncWorld(this.world, options);
	}

	async enter(
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): Promise<void> {
		const world = this.getOrCreateWorld({
			time: {
				previous: 0,
				secondsPassed: 0,
			},
			context,
			camera,
			input,
			assets,
		});

		this.onEnterWorld(world);
	}

	update(
		time: GameTime,
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): void {
		const world = this.getOrCreateWorld({
			time,
			context,
			camera,
			input,
			assets,
		});

		this.beforeUpdate(world);
		this.updatePipeline(world);
		this.afterUpdate(world);
	}

	draw(
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): void {
		if (!this.world) return;

		const world = this.syncWorld(this.world, {
			time: this.world.time,
			context,
			camera,
			input,
			assets,
		});

		this.beforeDraw(world);
		this.drawPipeline(world);
		this.afterDraw(world);
	}

	async exit(
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): Promise<void> {
		if (!this.world) return;

		const world = this.syncWorld(this.world, {
			time: this.world.time,
			context,
			camera,
			input,
			assets,
		});

		this.onExitWorld(world);
		this.world = null;
	}
}
