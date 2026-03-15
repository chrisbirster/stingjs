import { GamepadThumbstick } from '../constants/control';
import type { ControlConfig, ControlKey, GamePadState, GamepadThumbstickKey } from '../types';

export class InputManager {
	controls: ControlConfig[];
	heldKeys = new Set<string>();
	pressedKeys = new Set<string>();
	gamePads = new Map<number, GamePadState>();
	pressedButtons = new Set<string>();
	mappedKeys: string[];

	constructor(controls: ControlConfig[] = []) {
		this.controls = controls;
		this.mappedKeys = controls.flatMap(({ keyboard }) =>
			Object.values(keyboard).filter((code): code is string => typeof code === 'string'),
		);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.mappedKeys.includes(event.code)) return;

		event.preventDefault();
		this.heldKeys.add(event.code);
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		if (!this.mappedKeys.includes(event.code)) return;

		event.preventDefault();
		this.heldKeys.delete(event.code);
		this.pressedKeys.delete(event.code);
	};

	private handleBlur = (): void => {
		this.heldKeys.clear();
		this.pressedKeys.clear();
		this.pressedButtons.clear();
	};

	private handleGamepadConnected = (event: GamepadEvent): void => {
		const { gamepad: { index, axes, buttons } } = event;

		this.gamePads.set(index, { axes, buttons });
	};

	private handleGamepadDisconnected = (event: GamepadEvent): void => {
		const { gamepad: { index } } = event;

		this.gamePads.delete(index);
	};

	private getControls(id: number): ControlConfig | undefined {
		return this.controls[id];
	}

	private getKeyboardControl(id: number, control: ControlKey): string | undefined {
		return this.getControls(id)?.keyboard[control];
	}

	private getGamepadControl(
		id: number,
		control: ControlKey | GamepadThumbstickKey,
	): number | undefined {
		return this.getControls(id)?.gamePad[control];
	}

	register(): void {
		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);
		window.addEventListener('blur', this.handleBlur);
		window.addEventListener('gamepadconnected', this.handleGamepadConnected);
		window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
	}

	unregister(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		window.removeEventListener('blur', this.handleBlur);
		window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
		window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
		this.handleBlur();
	}

	pollGamepads(): void {
		for (const gamePad of navigator.getGamepads()) {
			if (!gamePad) continue;

			if (this.gamePads.has(gamePad.index)) {
				const { index, axes, buttons } = gamePad;

				this.gamePads.set(index, { axes, buttons });

				buttons.forEach((_, buttonIndex) => {
					const key = `${gamePad.index}-${buttonIndex}`;

					if (this.pressedButtons.has(key) && !this.isButtonDown(gamePad.index, buttonIndex)) {
						this.pressedButtons.delete(key);
					}
				});
			}
		}
	}

	isKeyDown(code?: string): boolean {
		return code ? this.heldKeys.has(code) : false;
	}

	isKeyPressed(code?: string): boolean {
		if (!code) return false;

		if (this.heldKeys.has(code) && !this.pressedKeys.has(code)) {
			this.pressedKeys.add(code);
			return true;
		}

		return false;
	}

	isButtonDown(padId: number, button?: number): boolean {
		return button !== undefined && (this.gamePads.get(padId)?.buttons[button]?.pressed ?? false);
	}

	isButtonPressed(padId: number, button?: number): boolean {
		if (button === undefined) return false;

		const key = `${padId}-${button}`;

		if (this.isButtonDown(padId, button) && !this.pressedButtons.has(key)) {
			this.pressedButtons.add(key);
			return true;
		}

		return false;
	}

	isAxeGreater(padId: number, axe: number | undefined, value: number): boolean {
		return axe !== undefined && (this.gamePads.get(padId)?.axes[axe] ?? Number.NEGATIVE_INFINITY) >= value;
	}

	isAxeLower(padId: number, axe: number | undefined, value: number): boolean {
		return axe !== undefined && (this.gamePads.get(padId)?.axes[axe] ?? Number.POSITIVE_INFINITY) <= value;
	}

	isControlDown(id: number, control: ControlKey): boolean {
		return this.isKeyDown(this.getKeyboardControl(id, control))
			|| this.isButtonDown(id, this.getGamepadControl(id, control));
	}

	isControlPressed(id: number, control: ControlKey): boolean {
		return this.isKeyPressed(this.getKeyboardControl(id, control))
			|| this.isButtonPressed(id, this.getGamepadControl(id, control));
	}

	isNegativeAxis(id: number, axis: GamepadThumbstickKey): boolean {
		const deadZone = this.getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0;

		return this.isAxeLower(id, this.getGamepadControl(id, axis), -deadZone);
	}

	isPositiveAxis(id: number, axis: GamepadThumbstickKey): boolean {
		const deadZone = this.getGamepadControl(id, GamepadThumbstick.DEAD_ZONE) ?? 0;

		return this.isAxeGreater(id, this.getGamepadControl(id, axis), deadZone);
	}
}
