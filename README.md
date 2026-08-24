# StingJS

StingJS is an Expo-like native application platform for SolidJS.

The project is being rebuilt around one goal: SolidJS components should render real native iOS and Android views and call native functionality from TypeScript without requiring application authors to write Swift or Kotlin for ordinary apps.

```text
SolidJS JSX
    ↓
@stingjs/solid
    ↓
Sting renderer contract
    ↓
Swift / Kotlin native runtime
    ↓
UIKit / Android Views
```

StingJS is **not** React Native, does not depend on Expo, and is not a WebView wrapper.

## Start here: how does this actually run?

If the jump from a SolidJS/Vite project to a native iOS app is confusing, read [`docs/how-sting-runs.md`](docs/how-sting-runs.md) first.

It explains, at both an ELI5 and technical level, how:

```text
App.tsx
  → Solid compiler + Vite
  → sting-app.js
  → Xcode packages the bundle
  → a JavaScript engine evaluates it inside the native app
  → the Sting bridge emits native mutations
  → Swift creates real UIKit views
  → UIKit events travel back into Solid
```

Vite is the compiler/bundler in that pipeline. The iOS application does not render HTML, use the DOM, or display a WebView.

## Status

The repository previously contained a browser game-engine experiment. That implementation is preserved on the `archive/game-engine-v0.1` branch. Active native-platform work flows through `feature/*` branches into `dev`, then from `dev` into `main` at reviewed milestones.

The first proof is intentionally small:

1. render a Solid component into a native view,
2. tap a native button,
3. update a Solid signal,
4. update native text,
5. invoke one native module (`Haptics`).

See [`docs/how-sting-runs.md`](docs/how-sting-runs.md), [`docs/architecture.md`](docs/architecture.md), [`docs/renderer.md`](docs/renderer.md), [`docs/native-modules.md`](docs/native-modules.md), and [`docs/roadmap.md`](docs/roadmap.md).

## Planned packages

- `@stingjs/core` — renderer/runtime contracts that do not depend on Solid.
- `@stingjs/solid` — the only layer coupled to Solid's universal renderer API.
- `@stingjs/native` — native UI primitives such as `View`, `Text`, and `Button`.
- `@stingjs/cli` — local developer tooling.
- `@stingjs/*` modules — platform capabilities such as haptics, filesystem, and secure storage.

## Current dependency policy

StingJS targets the SolidJS 2 architecture. Solid's universal renderer is treated as an implementation detail behind `@stingjs/solid`; application code must never import it directly.

## License

MIT
