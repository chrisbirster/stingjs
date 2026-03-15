import { Camera } from '../Camera';
import { getContext } from '../context';
import { InputManager } from '../input/InputManager';
import { publishGameDebugSnapshot } from '../solid/debugState';
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
		this.publishDebugSnapshot();
	};

	start(): void {
		this.input.register();

		window.requestAnimationFrame(this.frame);
	}

	private publishDebugSnapshot(): void {
		const imagesLoaded = this.assets.images.filter((image) => image.complete).length;
		const audioLoaded = this.assets.audio.filter((audio) => audio.readyState >= 2).length;
		const sceneDebugSnapshot = this.scene.getDebugSnapshot();

		publishGameDebugSnapshot({
			scene: this.scene.constructor.name,
			fps: this.frameTime.secondsPassed > 0 ? 1 / this.frameTime.secondsPassed : 0,
			frameMs: this.frameTime.secondsPassed * 1000,
			camera: {
				x: this.camera.position.x,
				y: this.camera.position.y,
			},
			assets: {
				images: {
					loaded: imagesLoaded,
					total: this.assets.images.length,
				},
				audio: {
					loaded: audioLoaded,
					total: this.assets.audio.length,
				},
			},
			selectedEntity: sceneDebugSnapshot?.selectedEntity ?? null,
		});
	}
}
