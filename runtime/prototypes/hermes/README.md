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
shared JavaScript workload
        -> Zig host
        -> Sting Hermes C ABI
        -> tiny C++ adapter
        -> Hermes / JSI
```

The C++ adapter owns only engine-specific concerns:

- Hermes runtime lifetime,
- JavaScript evaluation,
- microtask draining,
- benchmark output/error capture.

It must not own Sting renderer, module, event, lifecycle, or platform-neutral runtime semantics.

## Run

Requires Zig `0.16.0`, Git, CMake, Ninja, Python, and a C/C++ toolchain:

```sh
bash runtime/prototypes/hermes/run-host.sh
```

The source and build directories live outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## Current proof only

Passing this host proves that Zig can evaluate the same portable benchmark through an isolated Hermes C ABI. It does **not** yet prove the Solid/native renderer loop under Hermes and does not select Hermes as Sting's production engine.
