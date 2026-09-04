# StingJS

StingJS is an Expo-like native application platform for SolidJS 2.

Solid components render real native iOS and Android views and call native functionality from TypeScript without requiring application authors to write Swift, Kotlin, or Zig for ordinary applications.

```text
SolidJS JSX
    ↓
@stingjs/solid
    ↓
Sting renderer contract
    ↓
Official QuickJS + Sting native runtime
    ↓
UIKit / Android Views
```

StingJS is **not** React Native, does not depend on Expo, and is not a WebView wrapper.

## Create an application

The public StingJS 1.0 package train is designed around this workflow:

```bash
npm create sting@latest my-app
cd my-app
npm install
npx sting doctor
npx sting run ios
npx sting run android
```

Release candidates use the `next` npm dist-tag, for example `npm create sting@next my-app`. Until the first public package bootstrap is completed, repository contributors should use the source checkout and CI paths documented in `docs/releasing.md`; local source/tarball dependencies are not the supported public product path.

Ordinary generated application builds consume distributable native host artifacts and do **not** require a Sting source checkout or Zig.

## How it runs

Read [`docs/how-sting-runs.md`](docs/how-sting-runs.md) for the build/runtime walkthrough.

Vite and the Solid compiler produce a JavaScript application bundle. The native host evaluates that bundle in official QuickJS, and Sting translates the renderer's concrete host operations into UIKit or Android view mutations. Solid's reactive graph remains inside the JavaScript engine; native code never receives a virtual DOM or React-style reconciliation tree.

## 1.0 release-candidate status

The 1.0 software foundation includes:

- Sting-owned renderer, event, lifecycle, and module contracts;
- the real Solid 2 universal renderer adapter;
- UIKit and Android native hosts;
- application UI fundamentals including safe areas, keyboard/insets, modal/sheet, lists, navigation, gestures, focus, and accessibility;
- a canonical Sting Style IR, semantic styling, recipes, and platform modifiers;
- first-party application modules including Haptics, Clipboard, Device, Filesystem, Secure Store, Network, Sharing, Sensors, Image Picker, Location, Contacts, Camera, Notifications, Audio, and Background Task;
- `@stingjs/cli`, `create-sting`, doctor/run/test/ci/watch/start tooling, and Sting Go developer-client support;
- official QuickJS `2026-06-04` as the production JavaScript engine;
- distributable Android/iOS native host artifacts so ordinary consumers do not build Sting from Zig source;
- release packaging, exact-head CI gates, SemVer policy, and upgrade documentation.

QuickJS-NG is frozen as an experimental/reference prototype and is not a production or 1.0 parity requirement. React Native + Hermes remains the external performance/reference baseline, and JavaScriptCore/UIKit remains an independent iOS semantic/native reference lane.

Stable 1.0 still requires the explicit release gates tracked in #70: npm trusted-publisher bootstrap, an independent external RC consumer, and same-device physical Android QuickJS-vs-Hermes evidence. Simulator results are not represented as physical-device evidence.

## Packages

Public package surfaces include:

- `@stingjs/core` — renderer/runtime contracts independent of Solid;
- `@stingjs/solid` — Solid universal-renderer integration;
- `@stingjs/native` — native UI primitives;
- `@stingjs/modules-core` — shared native-module authoring boundary;
- `@stingjs/stylex` — optional StyleX integration seam;
- first-party `@stingjs/*` application modules;
- `@stingjs/cli` — local developer tooling;
- `create-sting` — application scaffolding.

All public packages in a release use one synchronized version.

## Example and contributor proofs

`examples/hello-world` is the repository's cross-platform smoke application. The same Solid bundle is packaged into iOS and Android native hosts and proves the native event/reactivity/module loop without HTML or a WebView.

The platform-specific `docs/getting-started-ios.md` and `docs/getting-started-android.md` pages describe contributor/runtime proof paths. Application authors should start with `create-sting` and the CLI rather than reproducing repository-internal build steps.

## Branch and release flow

Active work flows through `feature/*` branches into `dev`. Exact release candidates are promoted from `dev` to `main`; both prereleases and stable releases are dispatched from `main` through `.github/workflows/release.yml`. See [`docs/releasing.md`](docs/releasing.md).

The repository previously contained a browser game-engine experiment. That implementation is preserved on `archive/game-engine-v0.1`.

## License

MIT
