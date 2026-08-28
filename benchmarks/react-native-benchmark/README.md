# React Native / Hermes reference benchmark

This is the control implementation for StingJS performance work.

It is intentionally a **bare React Native application**, not Expo, because Sting itself is being compared to the React Native runtime/native-view stack rather than Expo's additional framework layer.

## Pins

- React Native: `0.87.0`
- React: template-selected version for RN 0.87 (currently 19.2.3)
- Hermes V1: `hermes-v250829098.0.16`
- `hermes-compiler`: `250829098.0.16`
- Community CLI generator: `20.2.0`
- package manager: npm

React Native 0.87's own package manifest and `.hermesv1version` are the authority for the Hermes pin.

## Why generate instead of hand-maintaining template files

The iOS/Android project should remain the actual React Native 0.87 community template, including its current Gradle, CocoaPods, codegen, and new-architecture settings. Maintaining a copied pseudo-template in Sting would make the baseline easier to accidentally skew.

`scripts/generate.sh` creates a clean pinned project outside the repository and then overlays `App.tsx` from this directory.

## Generate

```sh
bash benchmarks/react-native-benchmark/scripts/generate.sh
```

By default the project is generated under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}/react-native-0.87.0/StingRNBenchmark`.

Override with:

```sh
STING_RN_BASELINE_DIR=/absolute/path bash benchmarks/react-native-benchmark/scripts/generate.sh
```

## Workloads

The first committed UI implements:

- single counter update,
- sparse one-row update in 10,000 logical/native rows (target row 4,281),
- dense update of 100 deterministic rows out of 10,000.

Rows are memoized so the reference is not intentionally handicapped: unchanged row components may bail out according to normal React behavior. The parent still performs the ordinary immutable array update and reconciliation React requires.

This source is only the application workload. Native timestamps/mutation counters and release-build collection are added separately so benchmark instrumentation does not distort the normal app implementation.
