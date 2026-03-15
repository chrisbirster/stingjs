import type { World } from 'bitecs';
import type { Camera } from '../Camera';
import type { GameTime } from '../types';
import { Scene } from './Scene';

export type EcsSceneWorldResources = {
	context: CanvasRenderingContext2D;
	time: GameTime;
	camera: Camera;
};

export type CreateEcsSceneWorldOptions = EcsSceneWorldResources;

export abstract class EcsScene<TWorld extends World<EcsSceneWorldResources>> extends Scene {
	world: TWorld | null = null;

	protected abstract createWorld(options: CreateEcsSceneWorldOptions): TWorld;

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

	private syncWorld(world: TWorld, options: CreateEcsSceneWorldOptions): TWorld {
		world.time = options.time;
		world.context = options.context;
		world.camera = options.camera;

		return world;
	}

	protected getOrCreateWorld(options: CreateEcsSceneWorldOptions): TWorld {
		if (!this.world) {
			this.world = this.createWorld(options);
		}

		return this.syncWorld(this.world, options);
	}

	update(time: GameTime, context: CanvasRenderingContext2D, camera: Camera): void {
		const world = this.getOrCreateWorld({
			time,
			context,
			camera,
		});

		this.beforeUpdate(world);
		this.updatePipeline(world);
		this.afterUpdate(world);
	}

	draw(context: CanvasRenderingContext2D, camera: Camera): void {
		if (!this.world) return;

		const world = this.syncWorld(this.world, {
			time: this.world.time,
			context,
			camera,
		});

		this.beforeDraw(world);
		this.drawPipeline(world);
		this.afterDraw(world);
	}
}
