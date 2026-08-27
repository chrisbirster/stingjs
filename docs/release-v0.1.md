# v0.1 release checklist

Sting uses two release gates during the v0.1 cycle:

- **Prerelease gate** for `v0.1.0-alpha.N`, `v0.1.0-beta.N`, and `v0.1.0-rc.N`: the exact `main` commit must pass the complete software/build matrix. This lets stable `dev` milestones move to `main` and produce installable/testable GitHub prereleases without pretending the final physical validation is complete.
- **Final gate** for `v0.1.0`: the prerelease software gate plus the required physical Android runtime evidence and `npm run release:check:v0.1`.

This prevents `main` from drifting hundreds of commits behind `dev` while preserving the stronger evidence requirement for the final v0.1.0 declaration.

## Software gate

The exact candidate commit must pass:

- root TypeScript/typecheck/tests/build,
- official QuickJS semantic/runtime smoke,
- QuickJS-NG semantic/runtime smoke,
- Hermes containment/baseline regression smoke,
- React Native 0.87 + Hermes release baseline build,
- iOS JavaScriptCore/UIKit runtime + native framework/app build on the iOS simulator,
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

## Runtime evidence gate for final v0.1.0

`npm run release:check:v0.1` is the final-release machine gate. It requires:

1. repository version `0.1.0`,
2. a `0.1.0` changelog section,
3. ADR 0004 with `Status: accepted` and official QuickJS `2026-06-04` recorded as the production engine,
4. validated release physical-device evidence under `benchmarks/results/raw/`,
5. physical Android evidence for official QuickJS and QuickJS-NG,
6. physical Android evidence for the React Native/Hermes baseline,
7. a green iOS simulator/UIKit software matrix for the production QuickJS path, independent JavaScriptCore reference lane, and public primitive surface where applicable.

There is no physical iPhone available for v0.1. iOS simulator results are therefore compatibility/semantic evidence only. They must not be checked into `benchmarks/results/raw/`, used as physical-device performance numbers, or used to claim iPhone performance parity.

Official QuickJS `2026-06-04` is already the accepted v0.1 production engine. Same-device physical Android evidence validates and characterizes that direction rather than selecting among equal production candidates. The evidence still matters for startup, memory, event/native-update latency, module overhead, frame behavior, binary size, and other representative workloads. A severe correctness or performance blocker can reopen ADR 0004; otherwise v0.1 work should optimize and harden the accepted QuickJS path.

QuickJS-NG remains a temporary secondary conformance/performance lane and the React Native/Hermes application remains the external competitor/reference baseline. Neither creates a public engine-selection API.

The pinned Hermes V1 Sting candidate is not required as a physical Sting candidate because the conformance train already disqualified that exact runtime build on generic JavaScript lexical semantics. Hermes remains required as the React Native baseline. That result must not be generalized into a claim that SolidJS 2 is incompatible with every Hermes version.

## Catch-up promotion procedure

When `dev` has a coherent green milestone:

1. Finish or intentionally defer open PRs that belong in that milestone.
2. Open a promotion PR from `dev` to `main`.
3. Require the normal CI matrix on the promotion PR.
4. Merge the promotion PR to `main` without squashing away the development history.
5. Run **Release v0.1** manually from `main` with the next prerelease tag, for example `v0.1.0-rc.1`.
6. Continue development on `dev`; repeat with `rc.2`, `rc.3`, and so on when another meaningful stable batch accumulates.

The prerelease workflow runs the software/build gates and creates a GitHub prerelease. It deliberately skips only `npm run release:check:v0.1`, because that command is the physical-evidence gate reserved for final `v0.1.0`.

## Final release procedure

After the Android physical validation matrix is reviewed and no blocking QuickJS issue is found:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run release:check:v0.1
```

Promote the reviewed final milestone from `dev` to `main`, then run **Release v0.1** from `main` with tag `v0.1.0`.

For `v0.1.0`, the workflow re-runs the software gate, enforces the physical evidence gate, builds the Android release smoke artifact and iOS simulator native host, and creates the final GitHub release. Do not bypass the evidence check by manually creating the final tag/release.
