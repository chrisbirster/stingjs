# stingjs

`stingjs` is a `v0.1` browser game engine baseline built with Vite,
TypeScript, and a `bitECS` simulation core. The runtime stays imperative in the
hot loop while Solid powers the debug overlay and other reactive tooling at the
boundary.

## Features in v0.1

- ECS-first engine structure under `src/engine/core` and `src/engine/ecs`
- Canvas rendering, camera follow/clamp, keyboard and gamepad input
- Asset manifest loading for images and audio
- Sprite animation, world-bounds collision, and trigger overlap systems
- Deferred scene transitions with async `enter` / `exit` hooks
- Solid-powered debug overlay with entity, camera, asset, body, and overlap state
- Co-located Vitest coverage for key ECS systems and scene lifecycle behavior

## Commands

```bash
npm install
npm run dev
npm run test
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Project layout

- `src/engine/core/`: `Game`, `Scene`, `EcsScene`, lifecycle, transitions
- `src/engine/ecs/`: components, systems, collision helpers, world utilities
- `src/engine/solid/`: debug state and overlay mounting
- `src/game/`: sample scenes, prefabs, controls, constants, and world setup
- `images/` and `sound/`: example assets loaded through the manifest path

Vite aliases `engine/*` and `game/*` to `src/engine/*` and `src/game/*`.

## Sample flow

`src/index.ts` mounts the debug overlay and starts `TemplateExample`. The demo
scene animates the sword logo, follows it with the camera, resolves world
bounds, detects a portal trigger, and transitions into a second scene to
exercise the runtime API. Use that sample as the reference path for new engine
features and game code.
