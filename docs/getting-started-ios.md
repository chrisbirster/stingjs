# Run the first StingJS iOS proof

This is a framework proof, not the final `sting run ios` developer experience.

If you are new to the repository, read [`how-sting-runs.md`](how-sting-runs.md) first. It explains what happens between writing the SolidJS application, Vite producing `sting-app.js`, Xcode packaging that bundle, and Swift creating real UIKit views.

## Requirements

- macOS with Xcode
- Node.js 22+
- npm 12 (the repository pins `npm@12.0.2`)

## Run

From the repository root:

```sh
npm install
open examples/hello-world/ios/StingHelloWorld.xcodeproj
```

In Xcode, select the `StingHelloWorld` scheme and an iOS Simulator, then Run.

The app target has a build phase that:

1. runs the Vite build for `@stingjs/example-hello-world`,
2. produces `examples/hello-world/dist/sting-app.js`, and
3. copies that JavaScript file into the native iOS application bundle.

Vite is acting as a compiler/bundler here. The iOS application is not serving or displaying a webpage.

The native app then:

1. creates a `StingHostViewController`,
2. registers the Swift `HapticsModule`,
3. creates a JavaScriptCore context,
4. installs the native Sting bridge as `globalThis.__stingNativeBridge`,
5. evaluates `sting-app.js`,
6. lets Solid render through `@stingjs/solid` and `@stingjs/core`, and
7. maps Sting `view`, `text`, and `button` nodes to real UIKit views.

Tap **Add**. The round trip is:

```text
UIButton touchUpInside
  → native emits (nodeId, "press")
  → __stingDispatchEvent(...)
  → stored Solid onPress handler
  → setCount(count() + 1)
  → Solid reruns the dependent text computation
  → Sting replaceText(...)
  → UILabel text updates
```

The same handler invokes `Haptics.impact("medium")`, which crosses the native-module registry and calls `UIImpactFeedbackGenerator`.

## Automated native runtime test

You can run the same native/runtime proof from the repository root without manually opening Xcode:

```sh
npm run test:ios-runtime
```

The script builds the real hello-world and 10,000-row benchmark bundles, selects an available iPhone Simulator, and runs the `StingRuntime` XCTest suite.

The integration tests verify the important fine-grained behavior at the real JavaScript-to-native bridge boundary, including:

```text
counter press
→ exactly 1 replaceText mutation
→ Haptics medium is invoked

10,000-row sparse update
→ exactly 1 replaceText mutation

100-of-10,000 dense update
→ exactly 100 replaceText mutations
```

The sparse/dense hot paths must not replay unrelated create, remove, insert, property, or event-binding mutations.

## What this proves

The iOS proof establishes the core Sting loop:

```text
Solid component
→ Sting renderer
→ native UIKit view
→ native event
→ Solid signal update
→ precise native mutation
```

It does not by itself choose the long-term production JavaScript engine, layout architecture, navigation system, OTA system, or final developer tooling. Those are separate decisions documented elsewhere in the repository.
