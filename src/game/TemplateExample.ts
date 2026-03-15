import { Game } from 'engine/core/Game';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import { TestScene } from 'game/scenes/TestScene';

export class TemplateExample extends Game {
	scene = new TestScene();

	constructor() {
		super('body', SCREEN_WIDTH, SCREEN_HEIGHT);
	}
}
