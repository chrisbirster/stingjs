import { Camera } from '../Camera';
import { getContext } from '../context';
import { InputManager } from '../input/InputManager';
import type { AssetCollections, ControlConfig, GameTime } from '../types';
import type { Scene } from './Scene';

type GameOptions = {
	controls?: ControlConfig[];
	assets?: AssetCollections;
};

export abstract class Game {
	abstract scene: Scene;

	context: CanvasRenderingContext2D;
	camera = new Camera(0, 0);
	input: InputManager;
	assets: AssetCollections;

	frameTime: GameTime = {
		previous: 0,
		secondsPassed: 0,
	};

	constructor(
		selector: string,
		width: number,
		height: number,
		{ controls = [], assets = { images: [], audio: [] } }: GameOptions = {},
	) {
		this.context = getContext(selector, width, height);
		this.camera.setDimensions(width, height);
		this.input = new InputManager(controls);
		this.assets = assets;
	}

	frame = (time: DOMHighResTimeStamp): void => {
		window.requestAnimationFrame(this.frame);

		this.frameTime.secondsPassed = (time - this.frameTime.previous) / 1000;
		this.frameTime.previous = time;

		this.input.pollGamepads();
		this.scene.update(this.frameTime, this.context, this.camera, this.input, this.assets);
		this.scene.draw(this.context, this.camera, this.input, this.assets);
	};

	start(): void {
		this.input.register();

		window.requestAnimationFrame(this.frame);
	}
}
