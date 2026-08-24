# Official QuickJS runtime prototype

This directory is an **engine evaluation prototype**, not a StingJS engine decision.

It exists to answer two questions independently:

1. Can official QuickJS embed cleanly behind a Zig-owned Sting runtime boundary?
2. What does that choice cost or save in real StingJS application performance relative to QuickJS-NG, Sting/Hermes, and React Native/Hermes?

## Pin

The first prototype uses official QuickJS `2026-06-04` from Fabrice Bellard's release archive:

```text
https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz
SHA-256: b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a
```

Do not silently move this prototype to QuickJS master. Changing the tested release changes the benchmark subject and must be recorded in result metadata.

## Current proof

`src/main.zig` embeds the shared `benchmarks/js-engine/engine-bench.js` source and talks to QuickJS through the public C embedding API. The host provides only the `print()` function needed by the portable benchmark and explicitly drains QuickJS's pending-job queue so Promise/async probes complete.

The path is intentionally small:

```text
shared JavaScript workload
        -> official QuickJS
        -> QuickJS C API
        -> Zig host
```

This is the first step toward the real application path:

```text
Solid + Sting bundle
        -> official QuickJS
        -> QuickJS C API
        -> Zig Sting runtime
        -> Swift / Kotlin adapter
        -> native UI
```

The current runner does **not** yet claim that the full Solid/native event loop works under QuickJS.

## Run

Requires Zig `0.16.0`, `curl`, `make`, a host C toolchain, and `xz`/`tar` support:

```sh
bash runtime/prototypes/quickjs/run-host.sh
```

The script verifies the upstream archive checksum, builds the pinned QuickJS static library using upstream's Makefile, links the Zig host in `ReleaseFast`, and executes the same dependency-free JavaScript CPU probes used by the other engine candidates.

The source archive and build output are kept outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## What this prototype must not become accidentally

- a public `JavaScriptEngine` abstraction,
- a commitment to QuickJS,
- a reason to encode QuickJS `JSValue` in Sting APIs,
- a reason to keep the current JavaScriptCore JSON proof transport,
- a substitute for physical-device application benchmarks.

Before official QuickJS can win the engine decision, it still must prove the real renderer/event/module workloads and satisfy `docs/performance.md` on the same physical devices as QuickJS-NG, Sting/Hermes, and the React Native/Hermes baseline.
