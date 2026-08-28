# QuickJS-NG frozen reference prototype

This directory preserves StingJS's historical QuickJS-NG engine-evaluation work. **QuickJS-NG is not a StingJS production runtime and does not receive new renderer, Modules SDK, lifecycle, tooling, or first-party-module feature parity.**

StingJS production applications use official QuickJS `2026-06-04`. Application developers do not select an engine.

## Pin

- QuickJS-NG release: `v0.16.1`
- release date: 2026-08-04
- pinned commit: `954dc53628e36891f93c359aa60895c2ae3dac6b`

The retained runner fetches the release tag and verifies that it resolves to the pinned commit before building.

## Historical proof

The prototype demonstrated that the pinned candidate could run the portable JavaScript workload and representative Solid/Sting semantic workloads through a Zig-owned host boundary:

```text
Solid + Sting bundle
        -> QuickJS-NG
        -> QuickJS-NG C API
        -> Zig semantic host
```

That evidence remains useful as historical/reference data. It does not create a second supported runtime architecture.

## Optional research run

The standalone smoke may still be run explicitly while it remains inexpensive to maintain. It is non-blocking in CI and is intentionally outside normal Android/iOS application packaging:

```sh
bash runtime/prototypes/quickjs-ng/run-host.sh
```

Requires Zig `0.16.0`, Node/npm, Git, CMake, and a host C toolchain. The build lives outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## Maintenance policy

- do not add new Sting product features merely to keep this prototype current;
- a break in the optional QuickJS-NG lane must not block official-QuickJS product development or releases;
- do not package QuickJS-NG in normal generated applications;
- do not expose QuickJS-NG values or engine selection in public Sting APIs;
- preserve historical source/evidence unless separately archived or removed for a documented reason.
