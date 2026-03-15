import { GamepadThumbstick } from './constants/control';
import type { ControlConfig, ControlKey, GamePadState, GamepadThumbstickKey } from './types';
import { Control } from 'game/constants/controls';
import { controls } from 'game/config/controls';

const heldKeys = new Set<string>();
const pressedKeys = new Set<string>();

const gamePads = new Map<number, GamePadState>();
const pressedButtons = new Set<string>();

const mappedKeys = controls.flatMap(({ keyboard }) =>
	Object.values(keyboard).filter((code): code is string => typeof code === 'string'),
);

function getControls(id: number): ControlConfig | undefined {
	return controls[id];
}

function getKeyboardControl(id: number, control: ControlKey): string | undefined {
	return getControls(id)?.keyboard[control];
}

function getGamepadControl(
	id: number,
	control: ControlKey | GamepadThumbstickKey,
): number | undefined {
	return getControls(id)?.gamePad[control];
}

function handleKeyDown(event: KeyboardEvent): void {
	if (!mappedKeys.includes(event.code)) return;

	event.preventDefault();
	heldKeys.add(event.code);
}

function handleKeyUp(event: KeyboardEvent): void {
	if (!mappedKeys.includes(event.code)) return;

	event.preventDefault();
	heldKeys.delete(event.code);
	pressedKeys.delete(event.code);
}

function handleGamepadConnected(event: GamepadEvent): void {
	const { gamepad: { index, axes, buttons } } = event;

	gamePads.set(index, { axes, buttons });
}

function handleGamepadDisconnected(event: GamepadEvent): void {
	const { gamepad: { index } } = event;

	gamePads.delete(index);
}

export function registerKeyEvents(): void {
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
}

export function registerGamepadEvents(): void {
	window.addEventListener('gamepadconnected', handleGamepadConnected);
	window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
}

export function pollGamepads(): void {
	for (const gamePad of navigator.getGamepads()) {
		if (!gamePad) continue;

		if (gamePads.has(gamePad.index)) {
			const { index, axes, buttons } = gamePad;

			gamePads.set(index, { axes, buttons });

			buttons.forEach((_, buttonIndex) => {
				const key = `${gamePad.index}-${buttonIndex}`;

				if (pressedButtons.has(key) && !isButtonDown(gamePad.index, buttonIndex)) {
					pressedButtons.delete(key);
				}
			});
		}
	}
}

export function isKeyDown(code?: string): boolean {
	return code ? heldKeys.has(code) : false;
}

export function isKeyPressed(code?: string): boolean {
	if (!code) return false;

	if (heldKeys.has(code) && !pressedKeys.has(code)) {
		pressedKeys.add(code);
		return true;
	}

	return false;
}

export function isButtonDown(padId: number, button?: number): boolean {
	return button !== undefined && (gamePads.get(padId)?.buttons[button]?.pressed ?? false);
}

export function isButtonPressed(padId: number, button?: number): boolean {
	if (button === undefined) return false;

	const key = `${padId}-${button}`;

	if (isButtonDown(padId, button) && !pressedButtons.has(key)) {
		pressedButtons.add(key);
		return true;
	}

	return false;
}

export function isAxeGreater(padId: number, axe: number | undefined, value: number): boolean {
	return axe !== undefined && (gamePads.get(padId)?.axes[axe] ?? Number.NEGATIVE_INFINITY) >= value;
}

export function isAxeLower(padId: number, axe: number | undefined, value: number): boolean {
	return axe !== undefined && (gamePads.get(padId)?.axes[axe] ?? Number.POSITIVE_INFINITY) <= value;
}

export function isControlDown(id: number, control: ControlKey): boolean {
	return isKeyDown(getKeyboardControl(id, control)) || isButtonDown(id, getGamepadControl(id, control));
}

export function isControlPressed(id: number, control: ControlKey): boolean {
	return isKeyPressed(getKeyboardControl(id, control)) || isButtonPressed(id, getGamepadControl(id, control));
}

export function isLeft(id: number): boolean {
	return isControlDown(id, Control.LEFT)
		|| isAxeLower(
			id,
			getGamepadControl(id, GamepadThumbstick.HORIZONTAL_AXE_ID),
			-(getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0),
		);
}

export function isRight(id: number): boolean {
	return isControlDown(id, Control.RIGHT)
		|| isAxeGreater(
			id,
			getGamepadControl(id, GamepadThumbstick.HORIZONTAL_AXE_ID),
			getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0,
		);
}

export function isUp(id: number): boolean {
	return isControlDown(id, Control.UP)
		|| isAxeLower(
			id,
			getGamepadControl(id, GamepadThumbstick.VERTICAL_AXE_ID),
			-(getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0),
		);
}

export function isDown(id: number): boolean {
	return isControlDown(id, Control.DOWN)
		|| isAxeGreater(
			id,
			getGamepadControl(id, GamepadThumbstick.VERTICAL_AXE_ID),
			getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0,
		);
}

export function isIdle(id: number): boolean {
	return !(isLeft(id) || isRight(id) || isUp(id) || isDown(id));
}
