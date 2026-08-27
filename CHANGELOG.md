# Changelog

## 0.1.0 - unreleased

- Reframe StingJS as a native application platform for SolidJS 2.
- Add the Sting-owned shadow host, renderer contract, event routing, lifecycle semantics, and native-module bridge.
- Render real UIKit and Android views without a DOM, WebView, React Native renderer, or Expo runtime.
- Add `View`, `Text`, `Button`, `Image`, controlled `TextInput`, and `ScrollView` with a deliberately small cross-platform style contract.
- Prove native button -> JavaScript/Solid -> native text mutation and the Haptics native module on the platform hosts.
- Add broad Solid 2 conformance coverage for reactivity, ownership/lifecycle, control flow, lists, stores, async/races/streams, Reveal, actions/optimistic state, renderer torture, and a realistic composed application.
- Add official QuickJS, QuickJS-NG, and isolated Hermes/JSI -> C ABI -> Zig evaluation prototypes plus a bare React Native 0.87/Hermes baseline.
- Select official QuickJS `2026-06-04` as the Sting v0.1 production JavaScript engine while retaining QuickJS-NG as a secondary validation lane and React Native/Hermes as the external baseline.
- Record the pinned Hermes V1 Sting candidate's lexical-closure semantic disqualification while retaining Hermes as the React Native external baseline.
- Add native performance instrumentation, sparse/dense 10K workloads, physical-device capture contracts, raw-evidence validation, deterministic percentile summaries, and release evidence gates.
- Add Android Kotlin runtime/bridge, QuickJS/Zig production host, Haptics module, release build smoke, and emulator instrumentation CI.
- Preserve the original browser game-engine implementation on `archive/game-engine-v0.1`.

`v0.1.0` final remains blocked on the required same-device physical Android release evidence and the final software matrix. The repository may publish clearly marked `v0.1.0-alpha.N`, `v0.1.0-beta.N`, or `v0.1.0-rc.N` GitHub prereleases from `main` after the software gate passes; prereleases do not waive the final physical-evidence requirement.

Historical browser-engine release notes remain available on the archive branch.
