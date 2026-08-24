# Hermes V1 runtime prototype

This directory is an **engine evaluation prototype**, not a StingJS engine decision.

The prototype uses the exact Hermes V1 generation pinned by React Native 0.87 so Sting and the React Native baseline can be compared against the same engine family.

## Pin

React Native `0.87.0` pins:

```text
hermes-compiler: 250829098.0.16
Hermes tag:      hermes-v250829098.0.16
Hermes commit:   90f23852efcd361315688e2904d2446707fa274c
```

## Boundary

Hermes is C++/JSI, so this prototype deliberately isolates it behind a C ABI:

```text
Solid + Sting bundle
        -> Zig semantic host
        -> Sting Hermes C ABI
        -> tiny C++ adapter
        -> Hermes / JSI
```

The C++ adapter owns only engine-specific concerns:

- Hermes runtime lifetime,
- JavaScript evaluation,
- microtask draining,
- benchmark output/error capture,
- conversion of primitive JSI host-call arguments across the C ABI.

It must not own Sting renderer, module, event, lifecycle, or platform-neutral runtime semantics.

## Current proof

The pinned Hermes runtime executes:

1. the shared dependency-free JavaScript CPU benchmark,
2. the real hello-world Solid/Sting bundle, requiring press -> `Count: 1`, exactly one `replaceText`, zero unrelated mutation replay, and one `Haptics.impact("medium")`,
3. the real 10,000-row Solid/Sting bundle, requiring sparse = exactly one `replaceText` and dense = exactly 100 `replaceText` calls with zero unrelated mutation replay.

These are semantic host gates, not physical-device performance results. Passing them proves that the portable Sting renderer/event/module semantics can execute behind the isolated Hermes boundary; it does not select Hermes as Sting's production engine.

## Run

Requires Zig `0.16.0`, Node/npm, Git, CMake, Ninja, Python, and a C/C++ toolchain:

```sh
bash runtime/prototypes/hermes/run-host.sh
```

The source and build directories live outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.
