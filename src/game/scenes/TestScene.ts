import type { Camera } from 'engine/Camera';
import { pipeSystems } from 'engine/ecs/pipeline';
import { movementSystem } from 'engine/ecs/systems/movementSystem';
import { Scene } from 'engine/core/Scene';
import { playSound } from 'engine/soundHandler';
import type { GameTime } from 'engine/types';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import { spawnLogo } from 'game/prefabs/spawnLogo';
import { logoBounceSystem } from 'game/systems/logoBounceSystem';
import { renderLogoSystem } from 'game/systems/renderLogoSystem';
import { createDemoWorld, type DemoWorld } from 'game/world';

export class TestScene extends Scene {
	music: HTMLAudioElement;
	logoImage: HTMLImageElement;
	lightness = 22;
	world: DemoWorld | null = null;
	updateWorld = pipeSystems<DemoWorld>(movementSystem, logoBounceSystem);

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

	getOrCreateWorld(
		time: GameTime,
		context: CanvasRenderingContext2D,
		camera: Camera,
	): DemoWorld {
		if (!this.world) {
			this.world = createDemoWorld({
				time,
				context,
				camera,
				logo: this.logoImage,
				flashBorder: this.handleBorderFlash,
			});

			spawnLogo(this.world, SCREEN_WIDTH / 2, SCREEN_HEIGHT * 0.75);
		}

		this.world.time = time;
		this.world.context = context;
		this.world.camera = camera;

		return this.world;
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

	update(time: GameTime, context: CanvasRenderingContext2D, camera: Camera): void {
		const world = this.getOrCreateWorld(time, context, camera);

		camera.update();
		this.updateWorld(world);

		if (this.lightness > 22) this.lightness -= 200 * time.secondsPassed;
	}

	draw(context: CanvasRenderingContext2D, camera: Camera): void {
		context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

		if (this.world) {
			this.world.context = context;
			this.world.camera = camera;
			renderLogoSystem(this.world);
		}

		this.drawBorder(context);
		this.drawMessage(context);
	}
}
