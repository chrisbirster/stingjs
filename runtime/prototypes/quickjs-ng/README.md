# QuickJS-NG runtime prototype

This directory is an **engine evaluation prototype**, not a StingJS engine decision.

It exists beside the official QuickJS prototype so both candidates can run the same portable JavaScript workload through a Zig-owned host boundary.

## Pin

- QuickJS-NG release: `v0.16.1`
- release date: 2026-08-04
- pinned commit: `954dc53628e36891f93c359aa60895c2ae3dac6b`

The runner fetches the release tag and verifies that it resolves to the pinned commit before building.

## Current proof

```text
shared JavaScript workload
        -> QuickJS-NG
        -> QuickJS-NG C API
        -> Zig host
```

Like the official QuickJS prototype, this does not yet claim that the full Solid/native renderer loop works under QuickJS-NG.

## Run

Requires Zig `0.16.0`, Git, CMake, and a host C toolchain:

```sh
bash runtime/prototypes/quickjs-ng/run-host.sh
```

The build lives outside the repository under `${STING_RUNTIME_CACHE:-$TMPDIR/stingjs-runtime}`.

## Architecture rule

This prototype must remain a narrow engine adapter. Do not introduce QuickJS-NG values into public Sting APIs and do not treat the existence of multiple prototypes as justification for a permanent multi-engine abstraction.
