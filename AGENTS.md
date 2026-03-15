# Repository Guidelines

## Project Structure & Module Organization
`index.html` boots the app through Vite and loads `src/index.ts`. Engine runtime code lives in `src/engine/`: `core/` for `Game`, `Scene`, and lifecycle, `ecs/` for components/systems/collision, `solid/` for debug UI, and `assets/` / `input/` for resource helpers. The sample game layer lives in `src/game/` with `scenes/`, `prefabs/`, `constants/`, and `config/`. Static assets stay in `images/` and `sound/`. Keep reusable behavior in `engine` and sample-specific behavior in `game`.

## Build, Test, and Development Commands
Install dependencies with `npm install`, then use:

- `npm run dev` to start the Vite development server.
- `npm test` to run the Vitest suite.
- `npm run build` to create a production bundle in `dist/`.
- `npm run preview` to serve the production bundle locally.
- `npm run lint` to lint JavaScript and TypeScript-facing files.
- `npm run typecheck` to validate types using `tsconfig.json`.

Direct `file://` loading is not part of the supported workflow.

## Coding Style & Naming Conventions
Follow `.editorconfig`: tabs, tab width 2, CRLF line endings, final newline. ESLint enforces semicolons, single quotes, and trailing commas in multiline literals. Use PascalCase for classes and scene/prefab files (`TestScene.ts`, `ShrineScene.ts`), camelCase for functions and variables, and UPPER_SNAKE_CASE for exported constants. Prefer the Vite aliases (`engine/...`, `game/...`) over long relative paths. New ECS components should be singular nouns (`Body`, `TriggerBody`); systems should end in `System`.

## Testing Guidelines
Use `npm test`, `npm run typecheck`, and `npm run lint` as the minimum gate for every change. Keep tests close to the modules they cover, for example `src/engine/ecs/systems/animationSystem.test.ts`. Favor focused unit tests for ECS systems, collision helpers, and scene lifecycle hooks, then do a browser smoke test through `npm run dev` for rendering, input, audio, and transitions.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Fix typo on Camera class` and `Update utils and add lerp function`. Keep commits focused and descriptive. For pull requests, include a concise summary, automated/manual verification steps, linked issues when relevant, and screenshots or short clips for visible canvas/UI changes such as the sample scenes or debug overlay.
