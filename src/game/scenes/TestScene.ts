import { cameraClampSystem } from 'engine/ecs/systems/cameraClampSystem';
import { cameraFollowSystem } from 'engine/ecs/systems/cameraFollowSystem';
import { pipeSystems } from 'engine/ecs/pipeline';
import { movementSystem } from 'engine/ecs/systems/movementSystem';
import { renderSpriteSystem } from 'engine/ecs/systems/renderSpriteSystem';
import {
	EcsScene,
	type CreateEcsSceneWorldOptions,
} from 'engine/core/EcsScene';
import { Position } from 'engine/ecs/components/Position';
import { Velocity } from 'engine/ecs/components/Velocity';
import { playSound } from 'engine/soundHandler';
import { DemoAudioAsset } from 'game/constants/assets';
import { SCREEN_HEIGHT, SCREEN_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from 'game/constants/game';
import { spawnLogo } from 'game/prefabs/spawnLogo';
import { logoInputSystem } from 'game/systems/logoInputSystem';
import { logoBounceSystem } from 'game/systems/logoBounceSystem';
import { createDemoWorld, type DemoWorld } from 'game/world';

export class TestScene extends EcsScene<DemoWorld> {
	lightness = 22;
	hasStartedMusic = false;
	logoEntityId: number | null = null;
	updateSystems = pipeSystems<DemoWorld>(
		logoInputSystem,
		movementSystem,
		logoBounceSystem,
		cameraFollowSystem,
		cameraClampSystem,
	);
	drawSystems = pipeSystems<DemoWorld>(renderSpriteSystem);

	constructor() {
		super();
	}

	handleBorderFlash = (): void => {
		this.lightness = 100;
	};

	protected createWorld({ time, context, camera, input, assets }: CreateEcsSceneWorldOptions): DemoWorld {
		const world = createDemoWorld({
			time,
			context,
			camera,
			input,
			assets,
			bounds: {
				width: WORLD_WIDTH,
				height: WORLD_HEIGHT,
			},
			flashBorder: this.handleBorderFlash,
		});

		this.logoEntityId = spawnLogo(world, WORLD_WIDTH / 2, WORLD_HEIGHT * 0.75);

		return world;
	}

	protected beforeUpdate(world: DemoWorld): void {
		if (!this.hasStartedMusic) {
			const music = world.assets.audio[DemoAudioAsset.BGM];
			if (music) {
				playSound(music);
				this.hasStartedMusic = true;
			}
		}
	}

	protected updatePipeline(world: DemoWorld): DemoWorld {
		return this.updateSystems(world);
	}

	protected afterUpdate(world: DemoWorld): void {
		if (this.lightness > 22) {
			this.lightness = Math.max(22, this.lightness - 200 * world.time.secondsPassed);
		}
	}

	drawBorder(context: CanvasRenderingContext2D): void {
		context.lineWidth = 4;
		context.strokeStyle = `hsl(134 90% ${this.lightness}%)`;
		context.beginPath();
		context.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		context.stroke();
	}

	drawMessage(context: CanvasRenderingContext2D): void {
		context.textBaseline = 'middle';
		context.textAlign = 'center';
		context.fillStyle = 'white';

		context.font = 'normal 30px Nunito Sans';
		context.fillText('Chris\'s Dev Corner', SCREEN_WIDTH / 2, -15 + SCREEN_HEIGHT / 2);

		context.font = 'normal 18px Nunito Sans';
		context.fillText('Game Development Template', SCREEN_WIDTH / 2, 15 + SCREEN_HEIGHT / 2);
	}

	protected beforeDraw(world: DemoWorld): void {
		world.context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
	}

	protected drawPipeline(world: DemoWorld): DemoWorld {
		return this.drawSystems(world);
	}

	protected afterDraw(world: DemoWorld): void {
		this.drawBorder(world.context);
		this.drawMessage(world.context);
	}

	getDebugSnapshot() {
		if (!this.world || this.logoEntityId === null) {
			return null;
		}

		return {
			selectedEntity: {
				id: this.logoEntityId,
				label: 'sword-logo',
				position: {
					x: Position.x[this.logoEntityId],
					y: Position.y[this.logoEntityId],
				},
				velocity: {
					x: Velocity.x[this.logoEntityId],
					y: Velocity.y[this.logoEntityId],
				},
			},
		};
	}
}
