import { SCREEN_WIDTH, SCREEN_HEIGHT } from 'game/constants/game';
import type { Dimensions, Position } from './types';

export class Camera {
	position: Position;
	startPosition: Position;
	dimensions: Dimensions;

	constructor(x: number, y: number, width = SCREEN_WIDTH, height = SCREEN_HEIGHT) {
		this.position = { x, y };
		this.startPosition = { x, y };
		this.dimensions = { width, height };
	}

	reset(): void {
		this.position = { ...this.startPosition };
	}

	setDimensions(width: number, height: number): void {
		this.dimensions = { width, height };
	}

	update(): void {
		if (this.position.x < 0) this.position.x = 0;
		if (this.position.y < 0) this.position.y = 0;
		if (this.position.x > this.dimensions.width - SCREEN_WIDTH) {
			this.position.x = this.dimensions.width - SCREEN_WIDTH;
		}

		if (this.position.y > this.dimensions.height - SCREEN_HEIGHT) {
			this.position.y = this.dimensions.height - SCREEN_HEIGHT;
		}
	}
}
