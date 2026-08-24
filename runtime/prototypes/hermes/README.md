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
shared JavaScript workload / real Solid+Sting bundle
        -> Zig host
        -> Sting Hermes C ABI
        -> tiny C++ adapter
        -> Hermes / JSI
```

The C++ adapter owns only engine-specific concerns:

- Hermes runtime lifetime,
- JavaScript evaluation,
- microtask draining,
- output/error capture,
- primitive host-call conversion across the C ABI.

It must not own Sting renderer, module, event, lifecycle, or platform-neutral runtime semantics.

## Current semantic gate

The runner builds and executes three layers of evidence:

1. the shared dependency-free JavaScript CPU benchmark,
2. the real Solid/Sting hello-world bundle, requiring one press to produce exactly one `replaceText` plus one `Haptics.impact("medium")` call,
3. the real 10,000-row Solid/Sting benchmark, requiring the sparse row-4,281 update to produce exactly one `replaceText` and the deterministic dense update to produce exactly 100 `replaceText` calls, with zero unrelated structural/property/event mutation replay.

This proves engine compatibility with the current portable Sting semantics. It still does **not** select Hermes as the production engine or replace physical-device native-runtime measurements.

## Run

Requires Zig `0.16.0`, Git, CMake, Python, npm, and a C/C++ toolchain:

```sh
bash runtime/prototypes/hermes/run-host.sh
```

Ninja is optional. The runner prefers Ninja when it is already installed and otherwise uses CMake's Unix Makefiles generator so stock macOS development environments can run the prototype without another required build tool. The script prints the selected generator before configuration to make local failures easier to diagnose.

The source and build directories live outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.
