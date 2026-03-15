import { pipeSystems } from 'engine/ecs/pipeline';
import { movementSystem } from 'engine/ecs/systems/movementSystem';
import { renderSpriteSystem } from 'engine/ecs/systems/renderSpriteSystem';
import {
	EcsScene,
	type CreateEcsSceneWorldOptions,
} from 'engine/core/EcsScene';
import { playSound } from 'engine/soundHandler';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import { spawnLogo } from 'game/prefabs/spawnLogo';
import { logoBounceSystem } from 'game/systems/logoBounceSystem';
import { createDemoWorld, type DemoWorld } from 'game/world';

export class TestScene extends EcsScene<DemoWorld> {
	music: HTMLAudioElement;
	logoImage: HTMLImageElement;
	lightness = 22;
	updateSystems = pipeSystems<DemoWorld>(movementSystem, logoBounceSystem);
	drawSystems = pipeSystems<DemoWorld>(renderSpriteSystem);

	constructor() {
		super();

		const music = document.getElementById('bgm');
		if (!(music instanceof HTMLAudioElement)) {
			throw new Error('Unable to find background music element');
		}

		const logoImage = document.querySelector<HTMLImageElement>('img#logo');
		if (!logoImage) {
			throw new Error('Unable to find logo image element');
		}

		this.music = music;
		this.logoImage = logoImage;

		playSound(this.music);
	}

	handleBorderFlash = (): void => {
		this.lightness = 100;
	};

	protected createWorld({ time, context, camera }: CreateEcsSceneWorldOptions): DemoWorld {
		const world = createDemoWorld({
			time,
			context,
			camera,
			logo: this.logoImage,
			flashBorder: this.handleBorderFlash,
		});

		spawnLogo(world, SCREEN_WIDTH / 2, SCREEN_HEIGHT * 0.75);

		return world;
	}

	protected beforeUpdate(world: DemoWorld): void {
		world.camera.update();
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
}
