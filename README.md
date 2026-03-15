# stingjs

`stingjs` is a lightweight browser game starter built around the HTML canvas,
native ES modules, Vite, and TypeScript. It gives you a small runtime for the
game loop, scene management, camera handling, input, audio helpers, and a
working sample scene without forcing a heavy framework on top of the browser.

## What you get

- A Vite-powered development workflow with fast local iteration
- A small `Game -> Scene -> Entity` structure under `src/engine/`
- Example game code under `src/game/`
- TypeScript-first source files and shared engine types
- Keyboard and gamepad input helpers
- A sample scene that animates a bouncing sword logo

## Getting started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Type-check and lint the project:

```bash
npm run typecheck
npm run lint
```

## Project layout

- `src/index.ts`: browser entrypoint
- `src/engine/`: reusable runtime pieces such as `Game`, `Scene`, `Entity`, input, camera, and utilities
- `src/game/`: example game-specific code, constants, config, scenes, and entities
- `images/` and `sound/`: static assets used by the example

Vite aliases `engine/*` to `src/engine/*` and `game/*` to `src/game/*` so the
imports stay short and readable.

## Example flow

The sample app starts in `src/index.ts`, constructs `TemplateExample`, and then
boots `TestScene`, which renders the bouncing sword logo and plays the sample
music. Use it as a reference point, then replace the example scene and assets
with your own game code.
