import type { Camera } from '../Camera';
import type { InputManager } from '../input/InputManager';
import type { AssetCollections, GameTime, SceneDebugSnapshot } from '../types';

export abstract class Scene {
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

	getDebugSnapshot(): SceneDebugSnapshot | null {
		return null;
	}
}
