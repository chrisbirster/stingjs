# Changelog

## 0.1.0 - unreleased

- Reframe StingJS as a native application platform for SolidJS 2.
- Add the Sting-owned shadow host, renderer contract, event routing, lifecycle semantics, and native-module bridge.
- Render real UIKit and Android views without a DOM, WebView, React Native renderer, or Expo runtime.
- Add `View`, `Text`, `Button`, `Image`, controlled `TextInput`, and `ScrollView` as real native primitives.
- Prove native button -> JavaScript/Solid -> native text mutation and first-party native modules on the platform hosts.
- Add broad Solid 2 conformance coverage for reactivity, ownership/lifecycle, control flow, lists, stores, async/races/streams, Reveal, actions/optimistic state, renderer torture, and a realistic composed application.
- Evaluate official QuickJS, QuickJS-NG, and an isolated Hermes/JSI -> C ABI -> Zig prototype plus a bare React Native/Hermes comparison application.
- Select official QuickJS `2026-06-04` as the Sting v0.1 production JavaScript engine; keep QuickJS-NG and the Sting Hermes prototype as experimental/reference lanes rather than application engine choices.
- Add the Android Kotlin/native host backed by the official QuickJS + Zig production runtime, release builds, real emulator instrumentation, and prebuilt AAR consumption outside the monorepo without Zig.
- Build out the Modules SDK foundation with synchronous and asynchronous calls, structured errors, events/subscriptions, permission/config metadata, native object handles, native module views, and the Haptics, Clipboard, Device, and Filesystem modules.
- Add the modifier-first styling architecture: canonical Sting Style IR, deterministic precedence/reset semantics, semantic components/token props, `@stingjs/stylex`, recipes/variants, reactive resolution, and native platform modifiers.
- Add the Sting developer CLI foundation including project-aware `doctor`, device discovery, local start/run orchestration, typed project config, and `sting test` / `sting ci` verification commands.
- Split CI into responsibility-owned JS/TS, StingRuntime, Android, iOS, Modules, Tooling, and E2E workflows; add selective feature PR routing, full `dev` integration, and a full `dev -> main` Promotion Gate while moving comparison engines to experimental CI.
- Add native performance instrumentation, sparse/dense 10K workloads, physical-device capture contracts, raw-evidence validation, deterministic percentile summaries, and release evidence gates.
- Preserve the original browser game-engine implementation on `archive/game-engine-v0.1`.

Final `v0.1.0` remains gated on the required same-device physical Android release evidence and the final software/release matrix. Clearly marked `v0.1.0-alpha.N`, `v0.1.0-beta.N`, and `v0.1.0-rc.N` prereleases may be produced from promoted `main` milestones after the software and packaging gates pass; prereleases do not waive the final physical-evidence requirement.

Historical browser-engine release notes remain available on the archive branch.
