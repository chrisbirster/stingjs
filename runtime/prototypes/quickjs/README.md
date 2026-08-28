# Official QuickJS runtime prototype

This directory is an **engine evaluation prototype**, not a StingJS engine decision.

It exists to answer two questions independently:

1. Can official QuickJS embed cleanly behind a Zig-owned Sting runtime boundary?
2. What does that choice cost or save in real StingJS application performance relative to QuickJS-NG, Sting/Hermes, and React Native/Hermes?

## Pin

The prototype uses official QuickJS `2026-06-04` from Fabrice Bellard's release archive:

```text
https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz
SHA-256: b376e839b322978313d929fd20663b11ba58b75df5a46c126dd19ea2fa70ad2a
```

Do not silently move this prototype to QuickJS master. Changing the tested release changes the benchmark subject and must be recorded in result metadata.

## Current proof

`src/main.zig` embeds the shared `benchmarks/js-engine/engine-bench.js` source and talks to QuickJS through the public C embedding API. The host provides only the `print()` function needed by the portable benchmark and explicitly drains QuickJS's pending-job queue so Promise/async probes complete.

`src/sting_smoke.zig` goes further and evaluates the actual bundled Solid/Sting applications behind a Zig-owned host bridge. It currently requires all of the following:

- hello-world mounts `Count: 0` and a native button,
- dispatching the Sting press event produces `Count: 1`,
- that press emits exactly one `replaceText` and no structural/property/event replay,
- `Haptics.impact("medium")` is called exactly once,
- the 10,000-row benchmark mounts row 4,281,
- the sparse update emits exactly one `replaceText`,
- the dense 100-row fixture emits exactly 100 `replaceText` calls,
- both row hot paths emit zero unrelated mutations.

The path under test is:

```text
Solid + Sting bundle
        -> official QuickJS
        -> QuickJS C API
        -> Zig semantic host
```

This proves the portable Sting renderer/event/module semantics can execute under official QuickJS. It does **not** yet prove release-build device performance or select QuickJS as the production engine.

## Run

Requires Zig `0.16.0`, Node/npm, `curl`, `make`, a host C toolchain, and `xz`/`tar` support:

```sh
bash runtime/prototypes/quickjs/run-host.sh
```

The script verifies the upstream archive checksum, builds the pinned QuickJS static library using upstream's Makefile, builds the real Sting application bundles, links the Zig hosts in `ReleaseFast`, and runs both the portable CPU probes and Sting semantic gates.

The source archive and build output are kept outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## What this prototype must not become accidentally

- a public `JavaScriptEngine` abstraction,
- a commitment to QuickJS,
- a reason to encode QuickJS `JSValue` in Sting APIs,
- a reason to keep the current JavaScriptCore JSON proof transport,
- a substitute for physical-device application benchmarks.

Before official QuickJS can win the engine decision, it still must satisfy the full measurement matrix in `docs/performance.md` on the same physical devices as QuickJS-NG, Sting/Hermes, and the React Native/Hermes baseline.
