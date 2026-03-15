import type { Position } from '../types';

export function distance(pointA: Position, pointB: Position): number {
	const distanceX = pointA.x - pointB.x;
	const distanceY = pointA.y - pointB.y;

	return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
}

export function radians(pointA: Position, pointB: Position): number {
	const dy = pointB.y - pointA.y;
	const dx = pointB.x - pointA.x;

	return Math.atan2(-dy, -dx);
}

export const toDegrees = (radiansValue: number): number => radiansValue * 180 / Math.PI;

export const toRadians = (degrees: number): number => degrees * Math.PI / 180;

export const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(min, value), max);

export const lerp = (min: number, max: number, value: number): number => min + value * (max - min);
