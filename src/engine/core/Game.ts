import { Camera } from '../Camera';
import { getContext } from '../context';
import { loadAssetCollections } from '../assets/loadAssetCollections';
import { InputManager } from '../input/InputManager';
import { publishGameDebugSnapshot } from '../solid/debugState';
import type { AssetCollections, AssetManifest, ControlConfig, GameTime } from '../types';
import type { Scene, SceneController } from './Scene';

type GameOptions = {
	controls?: ControlConfig[];
	assets?: AssetCollections;
	assetManifest?: AssetManifest;
};

export abstract class Game implements SceneController {
	abstract scene: Scene;

	context: CanvasRenderingContext2D;
	camera = new Camera(0, 0);
	input: InputManager;
	assets: AssetCollections;
	assetManifest?: AssetManifest;
	animationFrameId: number | null = null;
	isRunning = false;
	hasStarted = false;
	isTransitioning = false;
	pendingScene: Scene | null = null;

	frameTime: GameTime = {
		previous: 0,
		secondsPassed: 0,
	};

	constructor(
		selector: string,
		width: number,
		height: number,
		{
			controls = [],
			assets = { images: [], audio: [] },
			assetManifest,
		}: GameOptions = {},
	) {
		this.context = getContext(selector, width, height);
		this.camera.setDimensions(width, height);
		this.input = new InputManager(controls);
		this.assets = assets;
		this.assetManifest = assetManifest;
	}

	frame = (time: DOMHighResTimeStamp): void => {
		if (!this.isRunning || this.isTransitioning) return;

		this.animationFrameId = null;

		this.frameTime.secondsPassed = (time - this.frameTime.previous) / 1000;
		this.frameTime.previous = time;

		this.input.pollGamepads();
		this.scene.update(this.frameTime, this.context, this.camera, this.input, this.assets);
		if (this.pendingScene) {
			void this.flushPendingSceneChange();
			return;
		}

		this.scene.draw(this.context, this.camera, this.input, this.assets);
		this.publishDebugSnapshot();
		this.scheduleFrame();
	};

	async start(): Promise<void> {
		if (this.hasStarted) return;

		this.hasStarted = true;
		this.bindScene(this.scene);
		this.input.register();
		if (this.assetManifest) {
			this.assets = await loadAssetCollections(this.assetManifest);
		}
		await this.scene.enter(this.context, this.camera, this.input, this.assets);
		this.isRunning = true;
		this.frameTime.previous = performance.now();
		this.publishDebugSnapshot();

		this.scheduleFrame();
	}

	pause(): void {
		this.isRunning = false;
		this.cancelScheduledFrame();
	}

	resume(): void {
		if (this.isRunning || !this.hasStarted || this.isTransitioning) return;

		this.isRunning = true;
		this.frameTime.previous = performance.now();
		this.scheduleFrame();
	}

	async stop(): Promise<void> {
		if (!this.hasStarted) return;

		this.pendingScene = null;
		this.pause();
		this.input.unregister();
		await this.scene.exit(this.context, this.camera, this.input, this.assets);
		this.hasStarted = false;
	}

	requestSceneChange(scene: Scene): void {
		if (!this.hasStarted) {
			this.scene = scene;
			this.bindScene(scene);
			return;
		}

		if (scene === this.scene && !this.pendingScene) return;

		this.pendingScene = scene;

		if (!this.isTransitioning && this.animationFrameId === null) {
			void this.flushPendingSceneChange();
		}
	}

	private bindScene(scene: Scene): void {
		scene.bindController(this);
	}

	private scheduleFrame(): void {
		if (!this.isRunning || this.isTransitioning || this.animationFrameId !== null) return;

		this.animationFrameId = window.requestAnimationFrame(this.frame);
	}

	private cancelScheduledFrame(): void {
		if (this.animationFrameId === null) return;

		window.cancelAnimationFrame(this.animationFrameId);
		this.animationFrameId = null;
	}

	private async flushPendingSceneChange(): Promise<void> {
		if (this.isTransitioning || !this.pendingScene) return;

		const nextScene = this.pendingScene;
		const shouldResume = this.isRunning;

		this.pendingScene = null;
		this.isTransitioning = true;
		this.cancelScheduledFrame();
		this.isRunning = false;

		await this.scene.exit(this.context, this.camera, this.input, this.assets);
		this.scene = nextScene;
		this.bindScene(this.scene);
		await this.scene.enter(this.context, this.camera, this.input, this.assets);
		this.publishDebugSnapshot();

		this.isTransitioning = false;

		if (shouldResume && this.hasStarted) {
			this.isRunning = true;
			this.frameTime.previous = performance.now();
			this.scheduleFrame();
		}

		if (this.pendingScene) {
			void this.flushPendingSceneChange();
		}
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
