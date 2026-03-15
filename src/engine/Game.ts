import { pollGamepads, registerGamepadEvents, registerKeyEvents } from './inputHandler';
import { getContext } from './context';
import { Camera } from './Camera';
import type { Scene } from './Scene';
import type { GameTime } from './types';

export abstract class Game {
	abstract scene: Scene;

	context: CanvasRenderingContext2D;
	camera = new Camera(0, 0);

	frameTime: GameTime = {
		previous: 0,
		secondsPassed: 0,
	};

	constructor(selector: string, width: number, height: number) {
		this.context = getContext(selector, width, height);
		this.camera.setDimensions(width, height);
	}

	frame = (time: DOMHighResTimeStamp): void => {
		window.requestAnimationFrame(this.frame);

		this.frameTime.secondsPassed = (time - this.frameTime.previous) / 1000;
		this.frameTime.previous = time;

		pollGamepads();
		this.scene.update(this.frameTime, this.context, this.camera);
		this.scene.draw(this.context, this.camera);
	};

	start(): void {
		registerKeyEvents();
		registerGamepadEvents();

		window.requestAnimationFrame(this.frame);
	}
}
