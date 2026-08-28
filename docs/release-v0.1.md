# v0.1 release checklist

Sting uses three deliberate boundaries during the v0.1 cycle:

1. **Feature PR gate** — selectively validates the responsibilities changed by a feature before it reaches `dev`.
2. **Promotion gate** — a `dev -> main` PR runs the full production integration matrix, including JS/TS, official QuickJS, Android, iOS, Modules, Tooling, and Android/iOS E2E.
3. **Release gate** — a manual release from `main` validates the tag, rebuilds the release-facing software/artifacts, and applies the physical-device evidence requirement only to final `v0.1.0`.

This lets coherent development milestones reach `main` and become installable prereleases without weakening the stronger evidence requirement for the final release.

## Promotion software gate

Before a `dev -> main` promotion is merged, **Promotion Gate / Required** must pass for the exact promotion head. The responsibility-owned workflows cover:

- JS/TS typecheck, tests, and builds,
- the official QuickJS production runtime smoke,
- Android Sting runtime compilation and real emulator instrumentation,
- iOS StingRuntime tests/build,
- first-party native module builds on Android and iOS,
- Tooling on Linux, macOS, and Windows,
- complete Android and iOS Hello World E2E composition.

QuickJS-NG, the isolated Hermes candidate, and the React Native/Hermes comparison are experimental/reference lanes. They are not part of the normal feature or promotion merge gate.

## Primitive gate

`docs/primitives.md` is the v0.1 public native-surface contract. UIKit and Android instrumentation must cover:

- View
- Text
- Button / press
- Image source/resize/accessibility
- controlled TextInput / changeText / editable
- ScrollView vertical/horizontal container behavior
- the documented style/layout contract

The cross-platform `examples/hello-world` application must continue to prove native event -> Solid -> native mutation through the production composition path.

## Prerelease gate

The manual **Release v0.1** workflow accepts:

- `v0.1.0-alpha.N`
- `v0.1.0-beta.N`
- `v0.1.0-rc.N`

A prerelease must run from `main`. The workflow re-runs the repository software gate and release-facing platform/package checks, stages the JavaScript bundle and Android distributable host artifacts, proves the Android AARs build in a Zig-free external consumer, validates the iOS native host, and creates a GitHub **prerelease**.

Prereleases deliberately do **not** run `npm run release:check:v0.1`; that command is the physical-evidence gate reserved for final `v0.1.0`.

## Runtime evidence gate for final v0.1.0

`npm run release:check:v0.1` is the final-release machine gate. It requires:

1. repository version `0.1.0`,
2. a `0.1.0` changelog section,
3. ADR 0004 with `Status: accepted` and official QuickJS `2026-06-04` recorded as the production engine,
4. validated release physical-device evidence under `benchmarks/results/raw/`,
5. physical Android evidence for official QuickJS,
6. physical Android evidence for the React Native/Hermes baseline,
7. a green iOS simulator/native software matrix for the production runtime architecture and independent JavaScriptCore reference lane where applicable.

There is no physical iPhone available for v0.1. iOS simulator results are compatibility/semantic evidence only. They must not be checked into `benchmarks/results/raw/`, used as physical-device performance numbers, or used to claim iPhone performance parity.

Official QuickJS `2026-06-04` is already the accepted production engine. Same-device physical Android evidence validates and characterizes that direction rather than selecting among equal production candidates. A severe correctness or performance blocker can reopen ADR 0004; otherwise work should optimize and harden the accepted QuickJS path.

## Catch-up promotion procedure

When `dev` has a coherent green milestone:

1. Finish or intentionally defer open work that belongs in that milestone.
2. Open or refresh the promotion PR from `dev` to `main`.
3. Require **Promotion Gate / Required** to pass.
4. Merge the promotion PR without squashing away the development history.
5. Run **Release v0.1** manually from `main` with the next prerelease tag, for example `v0.1.0-rc.1`.
6. Continue development on `dev`; repeat with later prereleases when another coherent batch is ready.

## Final release procedure

After the Android physical validation evidence is reviewed and no blocking official-QuickJS issue remains:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run release:check:v0.1
```

Promote the reviewed final milestone from `dev` to `main`, require the full Promotion Gate, then run **Release v0.1** from `main` with tag `v0.1.0`.

For `v0.1.0`, the workflow re-runs the release-facing software checks, enforces the physical evidence gate, builds/stages the release artifacts, validates the iOS native host, and creates the final GitHub release. Do not bypass the evidence check by manually creating the final tag/release.
