# Native modules

## Objective

A Sting native module gives TypeScript a stable, typed API backed by Swift and Kotlin without exposing the transport mechanism to application code.

Example application API:

```ts
import { Haptics } from "@stingjs/haptics";

Haptics.impact("medium");
```

## Package shape

```text
packages/modules/haptics/
├── package.json
├── src/
│   └── index.ts
├── ios/
│   └── HapticsModule.swift
├── android/
│   └── HapticsModule.kt
└── sting-module.json
```

The manifest is framework metadata, not the source of TypeScript types. Developer-facing TypeScript remains the canonical JS API; native registration is validated against the manifest during build/development tooling.

## Manifest v1

```json
{
  "schemaVersion": 1,
  "name": "Haptics",
  "package": "@stingjs/haptics",
  "version": "0.1.0",
  "ios": { "module": "HapticsModule" },
  "android": { "module": "com.stingjs.haptics.HapticsModule" }
}
```

## Native registry

Each platform runtime owns a module registry keyed by stable module name. Modules implement metadata plus callable methods. Registration must fail on duplicate names.

The bridge must distinguish:

- synchronous calls for genuinely cheap operations,
- asynchronous calls returning Promises,
- event subscriptions,
- lifecycle listeners.

Synchronous APIs should be rare. File IO, camera work, permissions, networking, and other potentially blocking operations must be asynchronous.

## Async calls

An async bridge call receives a monotonically unique request ID. Native eventually resolves or rejects that request. The JavaScript side owns the pending Promise table.

```text
JS invoke(module, method, args)
  → request id
  → native registry
  → native async operation
  → resolve(request id, value) / reject(request id, error)
  → Promise settles
```

Cancellation is deferred until the first API needs it; when added it will be an explicit capability rather than inferred from Promise abandonment.

## Errors

Native errors cross the boundary as a stable envelope:

```ts
interface StingNativeErrorData {
  code: string;
  message: string;
  module: string;
  method: string;
  details?: unknown;
}
```

JavaScript reconstructs a `StingNativeError`. Native exception class names and stack traces are diagnostic metadata, not public error codes.

## Events

Modules may publish named events. JavaScript subscriptions have explicit IDs so native can stop work when the last listener is removed. Event payloads are typed by the package's TS API.

## Lifecycle

Modules can subscribe to normalized runtime lifecycle events (created, mounted, foregrounded, backgrounded, destroyed). Platform implementations receive them through the registry rather than requiring consumers to edit AppDelegate/MainActivity.

## Permissions

Permissions are capabilities, not ad hoc module popups. Modules declare required permission keys in `sting-module.json`. A future `@stingjs/permissions` package exposes runtime requests/status. Tooling validates platform configuration and can add required Info.plist/AndroidManifest entries.

The v0.1 Haptics proof does not require a permission.

## Discovery

v0.1 first-party modules can be explicitly registered by the native host. v0.2 tooling will scan installed packages for `sting-module.json` and generate deterministic platform registration files. We should prove the registry contract before building autolinking.

## Type safety

Do not build a large code generator before the contract works. Initial modules use hand-authored TS interfaces plus native tests. After multiple modules expose recurring mistakes, introduce schema/codegen only for the portions where it removes demonstrated boilerplate.
