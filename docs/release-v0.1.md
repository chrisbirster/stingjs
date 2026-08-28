# v0.1 release checklist

The v0.1 release is intentionally blocked until both the software matrix and the required physical runtime validation evidence are complete.

## Software gate

The exact candidate commit must pass:

- root TypeScript/typecheck/tests/build,
- official QuickJS semantic/runtime smoke,
- Hermes containment/baseline regression smoke,
- React Native 0.87 + Hermes release baseline build,
- iOS JavaScriptCore/UIKit runtime + native framework/app build on the iOS simulator,
- Android Kotlin/QuickJS/Zig host build,
- Android release APK build,
- Android native instrumentation tests.

QuickJS-NG is a frozen experimental/reference prototype. Its standalone smoke may remain available as non-blocking research signal, but it is not part of the product software gate.

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
3. ADR 0004 with `Status: accepted` and official QuickJS `2026-06-04` recorded as the production engine,
4. validated release physical-device evidence under `benchmarks/results/raw/`,
5. physical Android evidence for official QuickJS,
6. physical Android evidence for the React Native/Hermes baseline,
7. a green iOS simulator/UIKit software matrix for the production runtime architecture, independent JavaScriptCore reference lane, and public primitive surface where applicable.

There is no physical iPhone available for v0.1. iOS simulator results are therefore compatibility/semantic evidence only. They must not be checked into `benchmarks/results/raw/`, used as physical-device performance numbers, or used to claim iPhone performance parity.

Official QuickJS `2026-06-04` is already the accepted production engine. Same-device physical Android evidence validates and characterizes that direction rather than selecting among equal production candidates. The evidence still matters for startup, memory, event/native-update latency, module overhead, frame behavior, binary size, and representative workloads. A severe correctness or performance blocker can reopen ADR 0004; otherwise work should optimize and harden the accepted QuickJS path.

QuickJS-NG benchmark data may remain as optional historical/research evidence but is not required for release. #69 tracks removing the old candidate from normal Android application packaging. React Native/Hermes remains the external competitor/reference baseline.

The pinned Hermes V1 Sting candidate is not required as a physical Sting candidate because the conformance train already disqualified that exact runtime build on generic JavaScript lexical semantics. Hermes remains required as the React Native baseline. That result must not be generalized into a claim that SolidJS 2 is incompatible with every Hermes version.

## Release procedure

After the Android physical validation matrix is reviewed and no blocking QuickJS issue is found:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run release:check:v0.1
```

Merge the reviewed milestone from `dev` to `main`, then run the **Release v0.1** workflow from `main` with tag `v0.1.0`.

The workflow re-runs the software/evidence gates, builds the Android release smoke artifact and iOS simulator native host, and creates the GitHub release. Do not bypass the evidence check by manually creating a tag/release.
