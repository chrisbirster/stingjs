import type { Camera } from '../Camera';
import type { InputManager } from '../input/InputManager';
import type { AssetCollections, GameTime, SceneDebugSnapshot } from '../types';

export interface SceneController {
	requestSceneChange(scene: Scene): void;
	pause(): void;
	resume(): void;
	stop(): Promise<void>;
}

export abstract class Scene {
	private controller: SceneController | null = null;

	bindController(controller: SceneController): void {
		this.controller = controller;
	}

	protected requestSceneChange(scene: Scene): void {
		this.controller?.requestSceneChange(scene);
	}

	protected pauseGame(): void {
		this.controller?.pause();
	}

	protected resumeGame(): void {
		this.controller?.resume();
	}

	protected stopGame(): Promise<void> | undefined {
		return this.controller?.stop();
	}

	async enter(
		_context: CanvasRenderingContext2D,
		_camera: Camera,
		_input: InputManager,
		_assets: AssetCollections,
	): Promise<void> {
		void _context;
		void _camera;
		void _input;
		void _assets;
	}

	abstract update(
		time: GameTime,
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): void;

	abstract draw(
		context: CanvasRenderingContext2D,
		camera: Camera,
		input: InputManager,
		assets: AssetCollections,
	): void;

	async exit(
		_context: CanvasRenderingContext2D,
		_camera: Camera,
		_input: InputManager,
		_assets: AssetCollections,
	): Promise<void> {
		void _context;
		void _camera;
		void _input;
		void _assets;
	}

	getDebugSnapshot(): SceneDebugSnapshot | null {
		return null;
	}
}
