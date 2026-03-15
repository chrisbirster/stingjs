import type { GameTime, Position } from './types';

export abstract class Entity {
	position: Position = { x: 0, y: 0 };
	velocity: Position = { x: 0, y: 0 };

	animationFrame = 0;
	animationTimer = 0;

	image: HTMLImageElement = new Image();

	constructor(position: Position) {
		this.position = position;
	}

	abstract update(time: GameTime): void;

	abstract draw(context: CanvasRenderingContext2D): void;
}
