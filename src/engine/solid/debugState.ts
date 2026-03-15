import { createSignal } from 'solid-js';
import type { GameDebugSnapshot } from '../types';

const initialDebugSnapshot: GameDebugSnapshot = {
	scene: 'boot',
	fps: 0,
	frameMs: 0,
	camera: { x: 0, y: 0 },
	assets: {
		images: { loaded: 0, total: 0 },
		audio: { loaded: 0, total: 0 },
	},
	selectedEntity: null,
};

const [overlayVisible, setOverlayVisible] = createSignal(true);
const [gameDebugSnapshot, setGameDebugSnapshot] = createSignal<GameDebugSnapshot>(initialDebugSnapshot);

let isHotkeyRegistered = false;

export function toggleDebugOverlay(): void {
	setOverlayVisible((visible) => !visible);
}

export function registerDebugOverlayHotkey(): void {
	if (isHotkeyRegistered) return;

	window.addEventListener('keydown', (event) => {
		if (event.code !== 'Backquote') return;

		event.preventDefault();
		toggleDebugOverlay();
	});

	isHotkeyRegistered = true;
}

export function publishGameDebugSnapshot(snapshot: GameDebugSnapshot): void {
	setGameDebugSnapshot(snapshot);
}

export {
	gameDebugSnapshot,
	overlayVisible,
};
