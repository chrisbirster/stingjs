import type { Camera } from 'engine/Camera';
import { Scene } from 'engine/core/Scene';
import type { InputManager } from 'engine/input/InputManager';
import type { AssetCollections, GameTime } from 'engine/types';
import { Control } from 'game/constants/controls';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';

type ShrineSceneOptions = {
	createReturnScene: () => Scene;
};

export class ShrineScene extends Scene {
	private readonly createReturnScene: () => Scene;

	constructor({ createReturnScene }: ShrineSceneOptions) {
		super();
		this.createReturnScene = createReturnScene;
	}

	update(
		_time: GameTime,
		_context: CanvasRenderingContext2D,
		_camera: Camera,
		input: InputManager,
		_assets: AssetCollections,
	): void {
		void _time;
		void _context;
		void _camera;
		void _assets;

		if (
			input.isControlPressed(0, Control.ACTION)
			|| input.isControlPressed(0, Control.START)
			|| input.isControlPressed(0, Control.ESCAPE)
		) {
			this.requestSceneChange(this.createReturnScene());
		}
	}

	draw(
		context: CanvasRenderingContext2D,
		_camera: Camera,
		_input: InputManager,
		_assets: AssetCollections,
	): void {
		void _camera;
		void _input;
		void _assets;

		context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		context.fillStyle = '#08171f';
		context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

		context.fillStyle = '#0f2b36';
		context.fillRect(36, 36, SCREEN_WIDTH - 72, SCREEN_HEIGHT - 72);

		context.strokeStyle = '#78ffd1';
		context.lineWidth = 4;
		context.strokeRect(36, 36, SCREEN_WIDTH - 72, SCREEN_HEIGHT - 72);

		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillStyle = '#e7fff5';

		context.font = 'normal 30px Nunito Sans';
		context.fillText('Shrine Scene', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 28);

		context.font = 'normal 18px Nunito Sans';
		context.fillText('Scene transitions are live in stingjs v0.1.', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 8);

		context.font = 'normal 16px Nunito Sans';
		context.fillText('Press Space, Enter, or Escape to return.', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40);
	}
}
