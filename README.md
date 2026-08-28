# StingJS

StingJS is an Expo-like native application platform for SolidJS 2.

Solid components render real native iOS and Android views and call native functionality from TypeScript without requiring application authors to write Swift or Kotlin for ordinary apps.

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

Read [`docs/how-sting-runs.md`](docs/how-sting-runs.md) for the build/runtime walkthrough.

Vite and the Solid compiler produce a JavaScript application bundle. A native host evaluates that bundle, and Sting translates the renderer's concrete host operations into UIKit or Android view mutations. Solid's reactive graph remains inside the JavaScript engine; native code never receives a virtual DOM or React-style reconciliation tree.

## v0.1 status

The v0.1 software foundation now includes:

- Sting-owned shadow host / renderer / event / lifecycle contracts,
- the real Solid 2 universal renderer adapter,
- real UIKit and Android native hosts,
- `View`, `Text`, `Button`, `Image`, controlled `TextInput`, and `ScrollView`,
- a small shared style/layout contract,
- native button -> Solid signal -> native text mutation,
- the Sting Modules SDK foundation with Haptics, Clipboard, Device, and Filesystem,
- broad Solid 2 conformance and realistic composed-app coverage,
- official QuickJS as the production JavaScript engine,
- a frozen QuickJS-NG historical/reference prototype,
- the historical isolated Hermes evaluation host,
- a bare React Native 0.87 + Hermes reference baseline,
- native performance instrumentation and physical-device evidence tooling,
- iOS and Android CI build/instrumentation gates.

StingJS uses **official QuickJS `2026-06-04`** as its production JavaScript engine. Normal Sting applications do not choose an engine. QuickJS-NG is frozen as an experimental/reference prototype and does not receive product feature parity. React Native + Hermes remains the external competitor/reference baseline, and JavaScriptCore/UIKit remains the independent iOS semantic/native reference lane. The pinned Hermes V1 Sting candidate was disqualified by a generic ECMAScript per-iteration lexical-closure preflight; that result does not imply that SolidJS 2 is generally incompatible with Hermes.

Physical Android evidence remains required to validate and characterize the accepted QuickJS direction. A severe correctness or performance blocker can reopen the decision, but the benchmark program does not block unrelated product work merely to keep engine selection open.

See [`docs/primitives.md`](docs/primitives.md), [`docs/modules.md`](docs/modules.md), [`docs/getting-started-ios.md`](docs/getting-started-ios.md), [`docs/getting-started-android.md`](docs/getting-started-android.md), [`docs/performance.md`](docs/performance.md), and [`docs/decisions/0004-production-javascript-engine.md`](docs/decisions/0004-production-javascript-engine.md).

## Packages

- `@stingjs/core` — renderer/runtime contracts that do not depend on Solid.
- `@stingjs/solid` — the only layer coupled to Solid's universal renderer API.
- `@stingjs/native` — native UI primitives.
- `@stingjs/modules-core` — shared JavaScript authoring boundary for native modules.
- `@stingjs/haptics`, `@stingjs/clipboard`, `@stingjs/device`, `@stingjs/filesystem`, and future `@stingjs/*` modules — platform capabilities.
- planned `@stingjs/cli` — local developer tooling once the current tooling train is integrated and distributable.

## Example

`examples/hello-world` is the cross-platform smoke application. The same Solid bundle is packaged into the iOS and Android native hosts and proves the native event/reactivity/module loop without HTML or a WebView.

## Branch and release flow

Active work flows through `feature/*` branches into `dev`. Reviewed milestones move from `dev` to `main`. The v0.1 release workflow is deliberately gated by CI plus the required physical-device runtime validation evidence; it cannot publish merely because a tag name exists.

The repository previously contained a browser game-engine experiment. That implementation is preserved on `archive/game-engine-v0.1`.

## License

MIT
