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

The C++ adapter owns only engine-specific concerns: runtime lifetime, JavaScript evaluation, microtask draining, output/error capture, and primitive host-call conversion. It must not own Sting renderer, module, event, lifecycle, or platform-neutral runtime semantics.

## Current semantic gate

The runner requires all of:

1. the shared dependency-free JavaScript CPU benchmark,
2. the real Solid/Sting hello-world bundle with one press -> exactly one `replaceText` plus one `Haptics.impact("medium")`,
3. the real 10,000-row Solid/Sting benchmark with sparse = exactly one `replaceText`, dense = exactly 100 `replaceText`, and zero unrelated mutation replay.

Official QuickJS and QuickJS-NG have been locally confirmed through the equivalent gate on macOS. Hermes still requires a successful run after the latest runner portability fixes.

Passing this gate still does **not** select Hermes as the production engine or replace physical-device native-runtime measurements.

## Run

Requires Zig `0.16.0`, Git, CMake, Python, npm, and a C/C++ toolchain:

```sh
bash runtime/prototypes/hermes/run-host.sh
```

Ninja is optional. The runner prefers Ninja when installed and otherwise uses CMake's Unix Makefiles generator so stock macOS development environments need no extra build tool. The selected generator is printed before configuration. Generator selection intentionally avoids empty Bash arrays so the runner works with stock macOS Bash 3.2 under `set -u`.

The source and build directories live outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.
