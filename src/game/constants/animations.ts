import type { SpriteAnimation, SpriteAnimationStep } from 'engine/types';
import { DemoImageAsset } from './assets';

const LOGO_FRAME_SIZE = 128;

function createLogoFrame(column: number, duration: number): SpriteAnimationStep {
	return {
		frame: [column * LOGO_FRAME_SIZE, 0, LOGO_FRAME_SIZE, LOGO_FRAME_SIZE],
		duration,
	};
}

export const demoAnimations: SpriteAnimation[] = [
	{
		image: DemoImageAsset.LOGO,
		steps: [
			createLogoFrame(0, 0.16),
			createLogoFrame(1, 0.12),
			createLogoFrame(2, 0.12),
			createLogoFrame(3, 0.2),
		],
	},
];
