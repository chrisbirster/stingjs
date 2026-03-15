import type { Camera } from '../Camera';
import type { GameTime } from '../types';

export abstract class Scene {
	abstract update(
		time: GameTime,
		context: CanvasRenderingContext2D,
		camera: Camera,
	): void;

	abstract draw(context: CanvasRenderingContext2D, camera: Camera): void;
}
