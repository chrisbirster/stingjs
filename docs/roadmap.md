# Roadmap

## v0.1 — native runtime proof

Exit criterion: one SolidJS application runs in a real iOS and Android native host and proves native event → Solid signal → native UI update. At least one native module works through the same runtime contract.

Implementation order:

1. repository reset and Sting-owned core contracts
2. Solid 2 universal renderer adapter
3. in-memory renderer tests
4. iOS JavaScriptCore host
5. UIKit `View`, `Text`, and `Button`
6. button event round-trip and reactive text update
7. minimal style/layout subset
8. Haptics native module
9. official QuickJS production-engine decision and portable host
10. Android native primitives and parity proof
11. `Image`, `TextInput`, and `ScrollView`
12. cross-platform smoke example and release hardening

`Image`, `TextInput`, and `ScrollView` are v0.1 features, but they are deliberately after the first three-component event proof.

Official QuickJS `2026-06-04` is the accepted v0.1 production JavaScript engine. QuickJS-NG remains a temporary secondary conformance/performance lane; React Native + Hermes remains the external competitor/reference baseline; JavaScriptCore/UIKit remains the independent iOS semantic/native reference lane. Physical Android evidence validates and characterizes the accepted QuickJS direction and can reopen the decision only if it exposes a severe blocker.

## v0.2 — developer experience

- `sting create`
- `sting dev`
- `sting run ios`
- `sting run android`
- project config
- local bundle/dev server
- reload and useful runtime errors
- fast refresh investigation after plain reload is reliable
- development-client groundwork

A Sting Go-style client is a product of a stable local runtime, not a prerequisite for v0.1.

## v0.3 — native module ecosystem

- stable module manifest/registry v1
- package discovery/autolinking
- async calls and events hardened across platforms
- lifecycle integration
- permission metadata/tooling
- first-party haptics, filesystem, clipboard, secure store, permissions, camera, and notifications modules

## Later

Navigation, gestures, production dev client, networking policy, Zig/native library embedding, cloud builds, signing, OTA updates, and app-store workflows follow demonstrated application needs.

Deez Mobile is a future consumer/requirements source, not part of StingJS implementation work in this repository.
