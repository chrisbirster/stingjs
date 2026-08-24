# QuickJS-NG runtime prototype

This directory is an **engine evaluation prototype**, not a StingJS engine decision.

It exists beside the official QuickJS prototype so both candidates can run the same portable JavaScript workload and the same real Solid/Sting semantic workloads through a Zig-owned host boundary.

## Pin

- QuickJS-NG release: `v0.16.1`
- release date: 2026-08-04
- pinned commit: `954dc53628e36891f93c359aa60895c2ae3dac6b`

The runner fetches the release tag and verifies that it resolves to the pinned commit before building.

## Current proof

The prototype runs three comparable gates:

1. the shared dependency-free JavaScript CPU benchmark,
2. the real hello-world Solid/Sting bundle, including press -> `Count: 1`, exactly one `replaceText`, and one `Haptics.impact("medium")`,
3. the real 10,000-row Solid/Sting bundle, requiring sparse = exactly one `replaceText` and dense = exactly 100 `replaceText` calls with zero unrelated mutation replay.

```text
Solid + Sting bundle
        -> QuickJS-NG
        -> QuickJS-NG C API
        -> Zig semantic host
```

QuickJS-NG's embedding API differs slightly from official QuickJS in places such as boolean helper return types. Those differences stay inside this prototype and must not leak into Sting's public runtime contract.

Passing these gates proves the portable Sting renderer/event/module semantics can execute under the pinned QuickJS-NG candidate. It does **not** select QuickJS-NG or replace physical-device release measurements.

## Run

Requires Zig `0.16.0`, Node/npm, Git, CMake, and a host C toolchain:

```sh
bash runtime/prototypes/quickjs-ng/run-host.sh
```

The build lives outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## Architecture rule

This prototype must remain a narrow engine adapter. Do not introduce QuickJS-NG values into public Sting APIs and do not treat the existence of multiple prototypes as justification for a permanent multi-engine abstraction.
