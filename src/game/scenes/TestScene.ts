import { cameraClampSystem } from 'engine/ecs/systems/cameraClampSystem';
import { cameraFollowSystem } from 'engine/ecs/systems/cameraFollowSystem';
import { pipeSystems } from 'engine/ecs/pipeline';
import { animationSystem } from 'engine/ecs/systems/animationSystem';
import { movementSystem } from 'engine/ecs/systems/movementSystem';
import { renderSpriteSystem } from 'engine/ecs/systems/renderSpriteSystem';
import { triggerOverlapSystem } from 'engine/ecs/systems/triggerOverlapSystem';
import { worldBoundsCollisionSystem } from 'engine/ecs/systems/worldBoundsCollisionSystem';
import { AnimationPlayer } from 'engine/ecs/components/AnimationPlayer';
import { Body } from 'engine/ecs/components/Body';
import { BodyTouching } from 'engine/ecs/components/BodyTouching';
import { OverlapState } from 'engine/ecs/components/OverlapState';
import {
	EcsScene,
	type CreateEcsSceneWorldOptions,
} from 'engine/core/EcsScene';
import { Position } from 'engine/ecs/components/Position';
import { Velocity } from 'engine/ecs/components/Velocity';
import { playSound, stopSound } from 'engine/soundHandler';
import { DemoAudioAsset } from 'game/constants/assets';
import { demoAnimations } from 'game/constants/animations';
import {
	PORTAL_HEIGHT,
	PORTAL_WIDTH,
	SCREEN_HEIGHT,
	SCREEN_WIDTH,
	WORLD_HEIGHT,
	WORLD_WIDTH,
} from 'game/constants/game';
import { spawnLogo } from 'game/prefabs/spawnLogo';
import { spawnPortal } from 'game/prefabs/spawnPortal';
import { ShrineScene } from 'game/scenes/ShrineScene';
import { logoInputSystem } from 'game/systems/logoInputSystem';
import { logoBounceSystem } from 'game/systems/logoBounceSystem';
import { createDemoWorld, type DemoWorld } from 'game/world';

export class TestScene extends EcsScene<DemoWorld> {
	lightness = 22;
	hasStartedMusic = false;
	logoEntityId: number | null = null;
	portalEntityId: number | null = null;
	updateSystems = pipeSystems<DemoWorld>(
		logoInputSystem,
		movementSystem,
		worldBoundsCollisionSystem,
		triggerOverlapSystem,
		logoBounceSystem,
		cameraFollowSystem,
		cameraClampSystem,
		animationSystem,
	);
	drawSystems = pipeSystems<DemoWorld>(renderSpriteSystem);

	constructor() {
		super();
	}

	handleBorderFlash = (): void => {
		this.lightness = 100;
	};

	protected createWorld({ time, context, camera, input, assets }: CreateEcsSceneWorldOptions): DemoWorld {
		const world = createDemoWorld({
			time,
			context,
			camera,
			input,
			assets: {
				...assets,
				animations: demoAnimations,
			},
			bounds: {
				width: WORLD_WIDTH,
				height: WORLD_HEIGHT,
			},
			flashBorder: this.handleBorderFlash,
		});

		this.logoEntityId = spawnLogo(world, WORLD_WIDTH / 2, WORLD_HEIGHT * 0.75);
		this.portalEntityId = spawnPortal(
			world,
			WORLD_WIDTH - PORTAL_WIDTH - 96,
			96,
			PORTAL_WIDTH,
			PORTAL_HEIGHT,
		);

		return world;
	}

	protected beforeUpdate(world: DemoWorld): void {
		if (!this.hasStartedMusic) {
			const music = world.assets.audio[DemoAudioAsset.BGM];
			if (music) {
				playSound(music);
				this.hasStartedMusic = true;
			}
		}
	}

	protected updatePipeline(world: DemoWorld): DemoWorld {
		return this.updateSystems(world);
	}

	protected afterUpdate(world: DemoWorld): void {
		if (this.lightness > 22) {
			this.lightness = Math.max(22, this.lightness - 200 * world.time.secondsPassed);
		}

		if (this.logoEntityId !== null && OverlapState.entered[this.logoEntityId] === 1) {
			this.requestSceneChange(new ShrineScene({
				createReturnScene: () => new TestScene(),
			}));
		}
	}

	drawBorder(context: CanvasRenderingContext2D): void {
		context.lineWidth = 4;
		context.strokeStyle = `hsl(134 90% ${this.lightness}%)`;
		context.beginPath();
		context.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		context.stroke();
	}

	private isPortalOverlapping(): boolean {
		return this.logoEntityId !== null && OverlapState.active[this.logoEntityId] === 1;
	}

	drawPortal(world: DemoWorld): void {
		if (this.portalEntityId === null) return;

		const entityId = this.portalEntityId;
		const drawX = Math.floor(Position.x[entityId] - world.camera.position.x);
		const drawY = Math.floor(Position.y[entityId] - world.camera.position.y);
		const isActive = this.isPortalOverlapping();

		world.context.fillStyle = isActive ? 'rgb(120 255 209 / 0.3)' : 'rgb(120 255 209 / 0.16)';
		world.context.fillRect(drawX, drawY, Body.width[entityId], Body.height[entityId]);

		world.context.lineWidth = 3;
		world.context.strokeStyle = isActive ? '#dffef6' : '#78ffd1';
		world.context.strokeRect(drawX, drawY, Body.width[entityId], Body.height[entityId]);

		world.context.textAlign = 'center';
		world.context.textBaseline = 'middle';
		world.context.fillStyle = '#dffef6';
		world.context.font = 'normal 16px Nunito Sans';
		world.context.fillText('portal', drawX + Body.width[entityId] / 2, drawY + Body.height[entityId] / 2);
	}

	drawMessage(context: CanvasRenderingContext2D): void {
		context.textBaseline = 'middle';
		context.textAlign = 'center';
		context.fillStyle = 'white';

		context.font = 'normal 30px Nunito Sans';
		context.fillText('stingjs', SCREEN_WIDTH / 2, -15 + SCREEN_HEIGHT / 2);

		context.font = 'normal 18px Nunito Sans';
		context.fillText(
			this.isPortalOverlapping()
				? 'portal entered, scene transition queued'
				: 'move the sword into the portal trigger',
			SCREEN_WIDTH / 2,
			15 + SCREEN_HEIGHT / 2,
		);
	}

	protected beforeDraw(world: DemoWorld): void {
		world.context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
	}

	protected drawPipeline(world: DemoWorld): DemoWorld {
		return this.drawSystems(world);
	}

	protected afterDraw(world: DemoWorld): void {
		this.drawPortal(world);
		this.drawBorder(world.context);
		this.drawMessage(world.context);
	}

	protected onExitWorld(world: DemoWorld): void {
		const music = world.assets.audio[DemoAudioAsset.BGM];

		if (music) {
			stopSound(music);
		}

		this.hasStartedMusic = false;
		this.logoEntityId = null;
		this.portalEntityId = null;
	}

	getDebugSnapshot() {
		if (!this.world || this.logoEntityId === null) {
			return null;
		}

		return {
			selectedEntity: {
				id: this.logoEntityId,
				label: 'sword-logo',
				position: {
					x: Position.x[this.logoEntityId],
					y: Position.y[this.logoEntityId],
				},
				velocity: {
					x: Velocity.x[this.logoEntityId],
					y: Velocity.y[this.logoEntityId],
				},
				body: {
					width: Body.width[this.logoEntityId],
					height: Body.height[this.logoEntityId],
				},
				touching: {
					left: BodyTouching.left[this.logoEntityId] === 1,
					right: BodyTouching.right[this.logoEntityId] === 1,
					top: BodyTouching.top[this.logoEntityId] === 1,
					bottom: BodyTouching.bottom[this.logoEntityId] === 1,
				},
				overlap: {
					active: OverlapState.active[this.logoEntityId] === 1,
					entered: OverlapState.entered[this.logoEntityId] === 1,
					exited: OverlapState.exited[this.logoEntityId] === 1,
					count: OverlapState.count[this.logoEntityId],
				},
				animation: {
					frame: AnimationPlayer.frame[this.logoEntityId],
					playing: AnimationPlayer.playing[this.logoEntityId] === 1,
				},
			},
		};
	}
}
