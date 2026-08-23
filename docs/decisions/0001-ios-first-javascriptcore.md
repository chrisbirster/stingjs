# ADR 0001: Use JavaScriptCore for the first iOS proof

- Status: accepted for v0.1 proof
- Date: 2026-08-23

## Context

StingJS needs a JavaScript runtime before Solid can drive native views. Selecting and integrating a cross-platform engine before proving the renderer would couple two difficult problems and slow the first demonstration.

## Decision

Use Apple's built-in JavaScriptCore framework for the first iOS runtime. Hide engine-specific behavior behind Sting runtime interfaces.

## Consequences

Positive:

- no third-party JS engine dependency for the first iOS proof,
- direct Swift integration,
- fast route to validating renderer/event/module semantics.

Negative:

- Android needs a separate engine decision,
- engine differences must be kept out of the public API,
- production debugging/performance requirements may cause a later iOS engine change.

This is not a commitment to JavaScriptCore for all platforms or all future releases.
