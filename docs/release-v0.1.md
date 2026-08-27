# v0.1 release checklist

The v0.1 release is intentionally blocked until both the software matrix and physical runtime evidence are complete.

## Software gate

The exact candidate commit must pass:

- root TypeScript/typecheck/tests/build,
- official QuickJS semantic/runtime smoke,
- QuickJS-NG semantic/runtime smoke,
- Hermes containment/baseline regression smoke,
- React Native 0.87 + Hermes release baseline build,
- iOS JavaScriptCore/UIKit runtime + native framework/app build,
- Android Kotlin/QuickJS/Zig host build,
- Android release APK build,
- Android native instrumentation tests.

The cross-platform `examples/hello-world` application must continue to prove native button -> Solid -> native text plus Haptics.

## Primitive gate

`docs/primitives.md` is the v0.1 public native-surface contract. UIKit and Android instrumentation must cover:

- View
- Text
- Button / press
- Image source/resize/accessibility
- controlled TextInput / changeText / editable
- ScrollView vertical/horizontal container behavior
- minimal style/layout mapping

## Runtime evidence gate

`npm run release:check:v0.1` is the machine gate. It requires:

1. repository version `0.1.0`,
2. a `0.1.0` changelog section,
3. ADR 0004 with `Status: accepted` and a named production engine,
4. validated release physical-device evidence under `benchmarks/results/raw/`,
5. both iOS and Android evidence for official QuickJS and QuickJS-NG,
6. both iOS and Android React Native/Hermes baseline evidence.

The pinned Hermes V1 Sting candidate is not required as a physical Sting candidate because the conformance train already disqualified that exact runtime build on JavaScript lexical semantics. Hermes remains required as the React Native baseline.

## Release procedure

After the evidence matrix is reviewed and ADR 0004 is accepted:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run release:check:v0.1
```

Merge the reviewed milestone from `dev` to `main`, then run the **Release v0.1** workflow from `main` with tag `v0.1.0`.

The workflow re-runs the software/evidence gates, builds the Android release smoke artifact and iOS native host, and creates the GitHub release. Do not bypass the evidence check by manually creating a tag/release.
