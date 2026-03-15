import { GamepadThumbstick } from './constants/control';
import { Control } from '../game/constants/controls';

export type ValueOf<T> = T[keyof T];

export type ControlKey = ValueOf<typeof Control>;
export type GamepadThumbstickKey = ValueOf<typeof GamepadThumbstick>;

export type GameTime = {
	previous: number;
	secondsPassed: number;
};

export type Position = {
	x: number;
	y: number;
};

export type Dimensions = {
	width: number;
	height: number;
};

export type Rect = Position & Dimensions;

export type Circle = Position & {
	radius: number;
};

export type Tile = {
	row: number;
	column: number;
};

export type Scale = readonly [number, number];
export type FrameDimensions = readonly [number, number, number, number];
export type FrameOrigin = readonly [number, number];
export type FrameData = readonly [FrameDimensions, FrameOrigin];
export type FrameDataMap = Map<string, FrameData>;

export type AnimationFrame = readonly [string, number];

export type GamepadControlMap = Partial<Record<ControlKey, number>>
	& Partial<Record<GamepadThumbstickKey, number>>;

export type KeyboardControlMap = Partial<Record<ControlKey, string>>;

export type ControlConfig = {
	gamePad: GamepadControlMap;
	keyboard: KeyboardControlMap;
};

export type GamePadState = Pick<Gamepad, 'axes' | 'buttons'>;

export type ImageAssets = {
	images: HTMLImageElement[];
};

export type AudioAssets = {
	audio: HTMLAudioElement[];
};

export type AssetCollections = ImageAssets & AudioAssets;

export type SpriteAnimationStep = {
	frame: FrameDimensions;
	duration: number;
};

export type SpriteAnimation = {
	image: number;
	loop?: boolean;
	steps: SpriteAnimationStep[];
};

export type AnimationAssets = {
	animations: SpriteAnimation[];
};

export type AssetManifest = {
	images?: string[];
	audio?: string[];
};

export type SelectedEntityDebugSnapshot = {
	id: number;
	label?: string;
	position?: Position;
	velocity?: Position;
	body?: Dimensions;
	touching?: {
		left: boolean;
		right: boolean;
		top: boolean;
		bottom: boolean;
	};
	overlap?: {
		active: boolean;
		entered: boolean;
		exited: boolean;
		count: number;
	};
	animation?: {
		frame: number;
		playing: boolean;
	};
};

export type SceneDebugSnapshot = {
	selectedEntity?: SelectedEntityDebugSnapshot | null;
};

export type GameDebugSnapshot = {
	scene: string;
	fps: number;
	frameMs: number;
	camera: Position;
	assets: {
		images: {
			loaded: number;
			total: number;
		};
		audio: {
			loaded: number;
			total: number;
		};
	};
	selectedEntity?: SelectedEntityDebugSnapshot | null;
};
