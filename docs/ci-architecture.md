# StingJS CI architecture

Sting CI is split by responsibility. A responsibility check validates its own layer; E2E validates composition across layers.

## Responsibility checks

| Workflow | Responsibility |
| --- | --- |
| `Check · JS / TS` | TypeScript typecheck, unit/conformance tests, package builds, StyleX/compiler coverage |
| `Check · StingRuntime` | Zig runtime and official QuickJS production-engine smoke |
| `Check · Android` | Android `StingRuntime` library compile and real runtime instrumentation |
| `Check · iOS` | Swift/UIKit `StingRuntime` tests and simulator build |
| `Check · Modules` | Native module packages built independently on Android and iOS |
| `Check · Tooling` | Sting CLI/tooling checks across Linux, macOS, and Windows |
| `Check · E2E` | Complete Hello World application with runtime, production engine, and modules assembled together |
| `Experimental Runtime Benchmarks` | QuickJS-NG, Hermes, and React Native/Hermes comparison evidence; never a feature merge gate |

The responsibility workflows are reusable through `workflow_call` and can also be launched manually with `workflow_dispatch`.

## Trigger model

### Feature pull request → `dev`

`PR Gate` classifies changed files and runs only affected responsibility checks. E2E does not run for ordinary feature work. Changes to CI workflow definitions intentionally run E2E so the integration workflow itself is validated before merge.

Examples:

- styling change in `packages/native` → JS/TS + StingRuntime + Android + iOS
- Android host-only change → Android
- native module change → JS/TS + Modules
- tooling change → Tooling
- docs-only change → classifier + required gate only

`PR Gate / Required` is the single aggregation check intended for branch protection.

### Push to `dev`

`Dev Integration` runs every production responsibility plus E2E. This is the integration boundary where Hello World is expected to prove that Runtime + QuickJS + modules work together.

### `dev` pull request → `main`

`Promotion Gate` requires `dev` as the source branch and runs the complete production stack plus E2E again. This validates the exact tree proposed for promotion.

### Experimental engines

`Experimental Runtime Benchmarks` runs manually or on a weekly schedule. Hermes and QuickJS-NG are comparison infrastructure, not production merge gates.

### Release

Release workflows remain responsible for release-specific packaging, distributable artifacts, tags, and release evidence. They should consume the same production assumptions rather than redefining which JavaScript engine is authoritative.

## Superseded runs

`PR Gate`, `Dev Integration`, and `Promotion Gate` use concurrency groups with `cancel-in-progress: true`. A newer commit replaces obsolete platform/E2E work instead of allowing stale Android/iOS runs to consume runners in parallel.

## Boundary rule

A platform/runtime check must not pull unrelated modules into its health signal.

For example:

- `Check · iOS` tests/builds `StingRuntime`; it does not build `StingHaptics`.
- `Check · Modules` owns the isolated `StingHaptics` build.
- `Check · E2E` owns proving that `StingHaptics` and the other modules compose successfully inside Hello World.

This keeps failures attributable to the layer that owns them while preserving full-system integration coverage at the correct boundaries.
