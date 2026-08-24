# Repository Guidelines

## Product direction
StingJS is an Expo-like native application platform for SolidJS. Native UI means UIKit views on iOS and Android Views on Android. Do not introduce React, React Native, Expo as a dependency, or a WebView-based core architecture. SolidJS remains the application reactive model.

The former browser game engine is historical work preserved on `archive/game-engine-v0.1`; do not copy its browser/canvas architecture into the native runtime.

## Branch and release flow
Work on focused `feature/*` branches. Merge reviewed feature PRs into `dev`. Promote `dev` to `main` for milestone releases and tag milestone releases from `main`. Avoid giant direct changes to `main`.

## Architecture boundaries
- `packages/core`: Sting-owned renderer, host-node, bridge, module, and lifecycle contracts. No Solid imports.
- `packages/solid`: adapter around the current Solid 2 universal/custom-renderer API. This is the only package allowed to depend directly on Solid renderer internals.
- `packages/native`: developer-facing native UI primitives.
- `packages/cli`: local create/dev/run tooling.
- `packages/modules/*`: first-party native modules.
- `native/ios` and `native/android`: platform runtime implementations.
- `examples/*`: executable proof applications.
- `docs/*`: architecture, contracts, ADRs, and milestone plans.

## Native bridge rules
Keep the JS/native contract small, explicit, versioned, and testable. Do not send executable code through serialized messages. Function/event handlers remain in the JS runtime and are referenced by node/event identity. Native module errors must have stable machine-readable codes. Platform-specific behavior must be documented when parity is impossible.

## Testing
Testing is a first-class requirement. At minimum, add unit coverage for renderer-host behavior and native-module contracts. Platform work should have Swift/Kotlin tests where practical and a hello-world smoke path that proves event round-tripping. CI should run TypeScript checks/tests on Linux and native compilation checks on macOS/Android runners as those hosts land.

## v0.1 scope discipline
Optimize for the smallest end-to-end native proof. Do not add cloud builds, app-store automation, authentication, billing, OTA updates, a large module catalog, or speculative abstractions before the native renderer/event/module path works.
