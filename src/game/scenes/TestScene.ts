import type { Camera } from 'engine/Camera';
import { Scene } from 'engine/Scene';
import { playSound } from 'engine/soundHandler';
import type { GameTime } from 'engine/types';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';
import { Logo } from 'game/entities/Logo';

export class TestScene extends Scene {
	music: HTMLAudioElement;
	logo: Logo;
	lightness = 22;

	constructor() {
		super();

		const music = document.getElementById('bgm');
		if (!(music instanceof HTMLAudioElement)) {
			throw new Error('Unable to find background music element');
		}

		this.music = music;
		this.logo = new Logo(
			{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.75 },
			this.handleBorderFlash,
		);

		playSound(this.music);
	}

	handleBorderFlash = (): void => {
		this.lightness = 100;
	};

	drawBorder(context: CanvasRenderingContext2D): void {
		context.lineWidth = 4;
		context.strokeStyle = `hsl(134 90% ${this.lightness}%)`;
		context.beginPath();
		context.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		context.stroke();
	}

	drawMessage(context: CanvasRenderingContext2D): void {
		context.textBaseline = 'middle';
		context.textAlign = 'center';
		context.fillStyle = 'white';

		context.font = 'normal 30px Nunito Sans';
		context.fillText('Chris\'s Dev Corner', SCREEN_WIDTH / 2, -15 + SCREEN_HEIGHT / 2);

		context.font = 'normal 18px Nunito Sans';
		context.fillText('Game Development Template', SCREEN_WIDTH / 2, 15 + SCREEN_HEIGHT / 2);
	}

	update(time: GameTime, _context: CanvasRenderingContext2D, camera: Camera): void {
		camera.update();
		this.logo.update(time);

		if (this.lightness > 22) this.lightness -= 200 * time.secondsPassed;
	}

	draw(context: CanvasRenderingContext2D, camera: Camera): void {
		void camera;
		context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

		this.logo.draw(context);
		this.drawBorder(context);
		this.drawMessage(context);
	}
}
