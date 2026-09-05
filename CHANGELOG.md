# Changelog

## 1.0.0-rc.1 - unreleased

- Establish StingJS as a native application platform for SolidJS 2 with a Sting-owned renderer, event, lifecycle, navigation, styling, and native-module contract.
- Render real UIKit and Android native views without a DOM, WebView, React Native renderer, or Expo runtime.
- Ship the Solid 2 universal renderer adapter, application primitives, safe-area/keyboard/inset handling, modal/sheet presentation, performant lists, focus/accessibility semantics, gestures, navigation, and lifecycle-safe root composition.
- Ship the canonical Sting Style IR, semantic components/token props, recipes/variants, reactive style resolution, optional `@stingjs/stylex`, and explicit platform modifiers.
- Ship the first-party application SDK: Haptics, Clipboard, Device, Filesystem, Secure Store, Network, Sharing, Sensors, Image Picker, Location, Contacts, Camera, Notifications, Audio, and Background Task.
- Select official QuickJS `2026-06-04` as the production JavaScript engine. Keep QuickJS-NG and the historical Sting Hermes prototype as reference lanes rather than application engine choices.
- Ship distributable Android and iOS production-host artifacts so ordinary generated applications do not require Zig or a Sting source checkout.
- Ship `@stingjs/cli`, `create-sting`, project-aware doctor/device/start/run/test/ci/watch tooling, and the Sting Go first-party developer client.
- Add reproducible Sting Go Android developer-client and iOS Simulator developer-client release artifacts with SHA-256 metadata.
- Add public packaging for the synchronized 22-package npm train, trusted-publishing/OIDC release workflow support, SemVer/public-API policy, upgrade documentation, and an atomic release-version transaction.
- Add clean tarball/external-consumer package isolation proof and exact-head CI/release gates.
- Measure JSON proof transport versus typed Zig ABI hot paths and adopt typed primitive hot paths with structured JSON fallback.
- Preserve same-device physical Android performance evidence, independent external RC consumption, and npm registry bootstrap/OIDC validation as explicit release gates rather than inferring them from simulator or monorepo CI.

Before this RC is published, npm package existence is bootstrapped with a separate non-product prerelease such as `1.0.0-bootstrap.0` under the `bootstrap` dist-tag. The real `1.0.0-rc.1` version is reserved for its first publication through GitHub Actions OIDC under npm's `next` dist-tag.

Stable `v1.0.0` remains gated by #5, #134, #135, and the master #70 release tracker.

Historical browser-engine work remains available on `archive/game-engine-v0.1`.
