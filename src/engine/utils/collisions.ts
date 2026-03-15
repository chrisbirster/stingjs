import type { Circle, Position, Rect } from '../types';
import { distance } from './maths';

export function pointRectangleOverlap(point: Position, rect: Rect): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.width &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.height
	);
}

export function pointCircleOverlap(point: Position, circle: Circle): boolean {
	return distance(point, circle) <= circle.radius;
}

export function rectanglesOverlap(rectA: Rect, rectB: Rect): boolean {
	return (
		rectA.x + rectA.width >= rectB.x &&
		rectA.x <= rectB.x + rectB.width &&
		rectA.y + rectA.height >= rectB.y &&
		rectA.y <= rectB.y + rectB.height
	);
}

export function circlesOverlap(circleA: Circle, circleB: Circle): boolean {
	const radii = circleA.radius + circleB.radius;

	return distance(circleA, circleB) <= radii;
}
