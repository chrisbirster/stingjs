import { Game } from 'engine/core/Game';
import { controls } from 'game/config/controls';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import { TestScene } from 'game/scenes/TestScene';

export class TemplateExample extends Game {
	scene = new TestScene();

	constructor() {
		super('body', SCREEN_WIDTH, SCREEN_HEIGHT, {
			controls,
			assetManifest: {
				images: [new URL('../../images/logo-atlas.svg', import.meta.url).href],
				audio: [new URL('../../sound/area12.ogg', import.meta.url).href],
			},
		});
	}
}
