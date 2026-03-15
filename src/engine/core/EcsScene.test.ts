import { addEntity, createWorld, type World } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { Camera } from 'engine/Camera';
import { EcsScene, type CreateEcsSceneWorldOptions, type EcsSceneWorldResources } from 'engine/core/EcsScene';
import { InputManager } from 'engine/input/InputManager';

type TestWorld = World<EcsSceneWorldResources> & EcsSceneWorldResources & {
	enterHookRan: boolean;
	exitHookRan: boolean;
	entityCount: number;
};

class StubEcsScene extends EcsScene<TestWorld> {
	enterCalls = 0;
	exitCalls = 0;

	protected createWorld(options: CreateEcsSceneWorldOptions): TestWorld {
		const world = createWorld(options) as TestWorld;
		addEntity(world);
		world.enterHookRan = false;
		world.exitHookRan = false;
		world.entityCount = 1;
		return world;
	}

	protected onEnterWorld(world: TestWorld): void {
		this.enterCalls += 1;
		world.enterHookRan = true;
	}

	protected onExitWorld(world: TestWorld): void {
		this.exitCalls += 1;
		world.exitHookRan = true;
	}
}

describe('EcsScene', () => {
	it('creates a world on enter and clears it on exit', async () => {
		const scene = new StubEcsScene();
		const context = {} as CanvasRenderingContext2D;
		const camera = new Camera(0, 0, 320, 180);
		const input = new InputManager();
		const assets = { images: [], audio: [] };

		await scene.enter(context, camera, input, assets);

		expect(scene.world).not.toBeNull();
		expect(scene.enterCalls).toBe(1);
		expect(scene.world?.enterHookRan).toBe(true);

		scene.update(
			{
				previous: 10,
				secondsPassed: 0.016,
			},
			context,
			camera,
			input,
			assets,
		);

		expect(scene.world?.time.secondsPassed).toBe(0.016);
		expect(scene.world?.entityCount).toBe(1);

		await scene.exit(context, camera, input, assets);

		expect(scene.exitCalls).toBe(1);
		expect(scene.world).toBeNull();
	});
});
