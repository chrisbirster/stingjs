# Run the first StingJS iOS proof

This is a framework proof, not the final `sting run ios` developer experience.

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

The app target has a build phase that compiles `examples/hello-world/src/index.tsx` with Solid's universal renderer configuration and copies the resulting `sting-app.js` into the application bundle.

The native app then:

1. creates a `StingHostViewController`,
2. registers the Swift `HapticsModule`,
3. creates a JavaScriptCore context,
4. exposes the Sting bridge as `__stingNativeBridge`,
5. evaluates `sting-app.js`,
6. maps `view`, `text`, and `button` nodes to UIKit views.

Tap **Add**. The intended round trip is:

```text
UIButton touchUpInside
  → native emits (nodeId, "press")
  → __stingDispatchEvent(...)
  → Solid onPress handler
  → setCount(count() + 1)
  → Solid reruns the dependent text computation
  → Sting replaceText(...)
  → UILabel text updates
```

The same handler invokes `Haptics.impact("medium")`, which crosses the module registry and calls `UIImpactFeedbackGenerator`.

## What this does not prove yet

A successful compile is not the same as a verified simulator interaction. Issue #3 remains open until the app is launched and the button/text round trip is observed. Android parity is separately tracked under issue #5.
