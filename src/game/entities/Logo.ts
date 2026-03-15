import { Entity } from 'engine/Entity';
import type { GameTime, Position } from 'engine/types';
import { FPS, SCREEN_HEIGHT, SCREEN_WIDTH } from 'game/constants/game';

const VELOCITY = FPS * 2;
const LOGO_MAX_WIDTH = SCREEN_WIDTH * 0.28;
const LOGO_MAX_HEIGHT = SCREEN_HEIGHT * 0.36;
const FALLBACK_IMAGE_SIZE = 256;

export class Logo extends Entity {
	onRebound: () => void;
	drawWidth: number;
	drawHeight: number;

	constructor(position: Position, onRebound: () => void) {
		super(position);

		const image = document.querySelector<HTMLImageElement>('img#logo');
		if (!image) {
			throw new Error('Unable to find logo image element');
		}

		this.image = image;
		this.onRebound = onRebound;
		this.velocity = { x: VELOCITY, y: VELOCITY };

		const { width, height } = this.getRenderSize();
		this.drawWidth = width;
		this.drawHeight = height;
		this.position = {
			x: position.x - this.drawWidth / 2,
			y: position.y - this.drawHeight / 2,
		};
	}

	updatePosition(time: GameTime): void {
		this.position.x += this.velocity.x * time.secondsPassed;
		this.position.y += this.velocity.y * time.secondsPassed;
	}

	getRenderSize(): { width: number; height: number } {
		const sourceWidth = this.image.naturalWidth || this.image.width || FALLBACK_IMAGE_SIZE;
		const sourceHeight = this.image.naturalHeight || this.image.height || FALLBACK_IMAGE_SIZE;
		const scale = Math.min(
			LOGO_MAX_WIDTH / sourceWidth,
			LOGO_MAX_HEIGHT / sourceHeight,
			1,
		);

		return {
			width: Math.floor(sourceWidth * scale),
			height: Math.floor(sourceHeight * scale),
		};
	}

	update(time: GameTime): void {
		this.updatePosition(time);

		const oldVelocity = { ...this.velocity };
		if (this.position.x < 0) this.velocity.x = VELOCITY;
		if (this.position.y < 0) this.velocity.y = VELOCITY;
		if (this.position.x > SCREEN_WIDTH - this.drawWidth) this.velocity.x = -VELOCITY;
		if (this.position.y > SCREEN_HEIGHT - this.drawHeight) this.velocity.y = -VELOCITY;

		if (oldVelocity.x !== this.velocity.x || oldVelocity.y !== this.velocity.y) {
			this.onRebound();
		}
	}

	draw(context: CanvasRenderingContext2D): void {
		context.drawImage(
			this.image,
			Math.floor(this.position.x),
			Math.floor(this.position.y),
			this.drawWidth,
			this.drawHeight,
		);
	}
}
