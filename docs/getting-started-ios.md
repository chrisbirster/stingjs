# iOS contributor runtime proof

This page documents the repository-level iOS runtime proof. It is **not** the normal application-author setup path.

For a published StingJS release, application authors create a project with `npm create sting@latest` (or `npm create sting@next` for an RC), install dependencies, run `npx sting doctor`, and use `npx sting run ios`. Ordinary generated application builds consume distributable Sting native host artifacts and do not require Zig or a Sting source checkout.

If you are contributing to Sting itself, read [`how-sting-runs.md`](how-sting-runs.md) first. Vite and the Solid compiler produce the JavaScript application bundle; official QuickJS evaluates it in the native host, and Sting maps renderer operations to real UIKit views.

## Repository proof requirements

These requirements are for building Sting itself from source:

- macOS with Xcode
- Node.js 22+
- npm 12.0.2
- Zig 0.16.0 for Sting source/runtime builds

## Run the repository proof

From the repository root:

```sh
npm install
open examples/hello-world/ios/StingHelloWorld.xcodeproj
```

In Xcode, select the `StingHelloWorld` scheme and an iOS Simulator, then Run.

The app target builds the shared Solid bundle and packages it into the native application. Vite is acting as a compiler/bundler; the application is not serving or displaying a webpage.

The production runtime path is:

```text
Solid component
→ @stingjs/solid universal renderer
→ official QuickJS 2026-06-04
→ Sting native runtime
→ real UIKit view
→ native event
→ Solid signal update
→ precise native mutation
```

## Automated native runtime test

Run the repository proof without manually opening Xcode:

```sh
npm run test:ios-runtime
```

The suite builds the real hello-world and benchmark bundles, selects an available iPhone Simulator, and runs the `StingRuntime` XCTest coverage. It verifies native event/reactivity/module behavior and fine-grained sparse/dense mutation counts at the real JavaScript-to-native boundary.

The release train separately packages a distributable official-QuickJS iOS host and proves a generated consumer can build it without Zig. Sting Go also produces a code-signing-disabled iOS Simulator developer-client artifact. Physical-iPhone/App Store signing remains a separate distribution concern and is not inferred from Simulator CI.

## Architecture note

Application code imports only Sting/Solid APIs. QuickJS values, UIKit objects, and Zig implementation details do not cross the public application API. See `docs/architecture.md`, `docs/how-sting-runs.md`, and `docs/primitives.md`.
