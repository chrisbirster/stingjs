# Repository Guidelines

## Project Structure & Module Organization
`index.html` boots the app through Vite and loads `src/index.ts`. Core runtime code lives in `src/engine/` (`Game`, `Scene`, input, camera, utilities). The example game layer lives in `src/game/` with `TemplateExample.ts`, `scenes/`, `entities/`, `constants/`, and `config/`. Static assets stay in `images/` and `sound/`. Keep reusable logic in `engine` and game-specific behavior in `game`.

## Build, Test, and Development Commands
Install dependencies with `npm install`, then use:

- `npm run dev` to start the Vite development server.
- `npm run build` to create a production bundle in `dist/`.
- `npm run preview` to serve the production bundle locally.
- `npm run lint` to lint JavaScript and TypeScript-facing files.
- `npm run typecheck` to validate types using `tsconfig.json`.

Direct `file://` loading is not part of the supported workflow.

## Coding Style & Naming Conventions
Follow `.editorconfig`: tabs, tab width 2, CRLF line endings, final newline. ESLint enforces semicolons, single quotes, and trailing commas in multiline literals. Use PascalCase for classes and scene/entity files (`TestScene.ts`, `Logo.ts`), camelCase for functions and variables, and UPPER_SNAKE_CASE for exported constants. Prefer the Vite aliases (`engine/...`, `game/...`) over long relative paths.

## Testing Guidelines
There is no automated test suite yet. Treat `npm run lint`, `npm run typecheck`, and a browser smoke test through `npm run dev` as the minimum gate for every change. Verify that the sample scene renders, input still works, and audio-related edits fail gracefully in the browser. If you add a test harness, keep tests close to the module they cover and document the new command here.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects such as `Fix typo on Camera class` and `Update utils and add lerp function`. Keep commits focused and descriptive. For pull requests, include a concise summary, manual verification steps, linked issues when relevant, and screenshots or short clips for visible canvas/UI changes.
