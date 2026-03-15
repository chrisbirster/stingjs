import type { FrameData, FrameDimensions, Scale } from './types';

export function getContext(
	parentSelector = 'body',
	width = 256,
	height = 256,
): CanvasRenderingContext2D {
	const parentElement = document.querySelector<HTMLElement>(parentSelector);

	if (!parentElement) {
		throw new Error('Unable to find parent element');
	}

	const canvas = document.createElement('canvas');
	parentElement.appendChild(canvas);

	const context = canvas.getContext('2d');

	if (!context) {
		throw new Error('Unable to find canvas context');
	}

	context.canvas.width = width;
	context.canvas.height = height;
	context.imageSmoothingEnabled = false;

	return context;
}

export function drawFrame(
	context: CanvasRenderingContext2D,
	image: HTMLImageElement,
	dimensions: FrameDimensions,
	x: number,
	y: number,
	scale: Scale = [1, 1],
): void {
	const [sourceX, sourceY, sourceWidth, sourceHeight] = dimensions;

	context.scale(scale[0], scale[1]);
	context.drawImage(
		image,
		sourceX, sourceY, sourceWidth, sourceHeight,
		x * scale[0], y * scale[1], sourceWidth, sourceHeight,
	);
	context.setTransform(1, 0, 0, 1, 0, 0);
}

export function drawFrameOrigin(
	context: CanvasRenderingContext2D,
	image: HTMLImageElement,
	frame: FrameData,
	x: number,
	y: number,
	scale: Scale = [1, 1],
): void {
	const [dimensions, [originX, originY]] = frame;
	drawFrame(context, image, dimensions, x - originX * scale[0], y - originY * scale[1], scale);
}

export function drawTile(
	context: CanvasRenderingContext2D,
	image: HTMLImageElement,
	tile: number,
	x: number,
	y: number,
	tileSize = 16,
): void {
	const noTilesWidth = Math.floor(image.width / tileSize);

	context.drawImage(
		image,
		(tile % noTilesWidth) * tileSize,
		Math.floor(tile / noTilesWidth) * tileSize,
		tileSize, tileSize,
		x, y, tileSize, tileSize,
	);
}
