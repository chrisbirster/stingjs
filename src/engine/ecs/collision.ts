import type { Rect } from '../types';
import { rectanglesOverlap } from '../utils/collisions';
import { Body } from './components/Body';
import { Position } from './components/Position';

export function getBodyRect(entityId: number): Rect {
	const offsetX = Body.offsetX[entityId] ?? 0;
	const offsetY = Body.offsetY[entityId] ?? 0;
	const width = Body.width[entityId] ?? 0;
	const height = Body.height[entityId] ?? 0;

	return {
		x: (Position.x[entityId] ?? 0) + offsetX,
		y: (Position.y[entityId] ?? 0) + offsetY,
		width,
		height,
	};
}

export function bodiesOverlap(entityAId: number, entityBId: number): boolean {
	return rectanglesOverlap(getBodyRect(entityAId), getBodyRect(entityBId));
}
