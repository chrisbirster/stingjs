# ADR 0002: Isolate Solid's universal renderer behind `@stingjs/solid`

- Status: accepted
- Date: 2026-08-23

## Context

Solid 2's universal/custom-renderer APIs are exactly the capability Sting needs, but Solid 2 is currently in the RC line and renderer/compiler details are not a contract Sting should expose to applications or native runtimes.

## Decision

Only `@stingjs/solid` may import the Solid universal renderer package or depend on compiler-specific renderer behavior. `@stingjs/core` defines a Sting-owned host contract, and native runtimes implement that contract rather than Solid's contract.

## Consequences

- Solid upgrades are localized to one package.
- Core/native tests can run without Solid.
- Sting can add compatibility shims or pin a renderer version without changing application APIs.
- The adapter must be deliberately small and well-tested.
