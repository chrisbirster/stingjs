# Sting Go

Sting Go is the first-party developer client for quickly opening standard StingJS projects on Android and iOS.

It is analogous to Expo Go in product role, not implementation architecture. Sting Go must use the normal Sting runtime: SolidJS 2, `@solidjs/universal`, official QuickJS, the Zig-centered Sting boundary, Swift/UIKit on iOS, and Kotlin/native Views on Android.

## Product boundary

Sting Go includes the standard first-party Sting SDK compiled into the client. It is intended for fast learning, examples, prototyping, and development against that known native capability set.

Projects that add custom third-party native modules will eventually require a project-specific Sting development build rather than dynamically injecting arbitrary native code into Sting Go.

## v1 launch protocol

`sting start` serves a versioned manifest and bundle. Sting Go opens a URL such as:

```text
sting://go?url=http%3A%2F%2F192.168.1.10%3A8081%2Fmanifest
```

The v1 manifest is the authoritative discovery document. It identifies the production engine and runtime version, names required standard-SDK capabilities, and publishes the bundle, reload, and health endpoints:

```json
{
  "schemaVersion": 1,
  "runtimeVersion": "0.1.0",
  "engine": "quickjs",
  "project": { "name": "my-app" },
  "bundle": {
    "path": "/bundle",
    "contentType": "application/javascript"
  },
  "development": {
    "reload": {
      "path": "/events",
      "transport": "sse",
      "contentType": "text/event-stream"
    },
    "health": {
      "path": "/health",
      "contentType": "application/json"
    }
  },
  "capabilities": ["clipboard", "haptics"]
}
```

Endpoint paths are resolved relative to the manifest URL. Clients must not hard-code a different host or port.

### v1 compatibility rule

Before downloading or evaluating a bundle, Sting Go must reject the project with a native, actionable error when any of these checks fail:

- `schemaVersion` is not `1`;
- `engine` is not `quickjs`;
- `runtimeVersion` does not exactly match the runtime compiled into that Sting Go build;
- the manifest requests a standard-SDK capability that the client does not provide.

Exact runtime matching is deliberately conservative for v1. A future schema can define a broader compatibility range without teaching v1 clients to guess.

The native launcher:

1. extracts the manifest URL from the deep link or manual URL entry;
2. fetches `/manifest`;
3. validates the JSON against the v1 shape and compatibility rule;
4. resolves the manifest-relative bundle and development endpoints;
5. downloads the JavaScript bundle;
6. creates/resets the normal Sting QuickJS runtime;
7. attaches a fresh native root and evaluates the bundle;
8. surfaces connection, compatibility, bundle, and runtime errors using native UI;
9. connects to the advertised SSE reload endpoint and reconnects without reinstalling the client.

`ready` and `reload` events carry a monotonic reload version. On reconnect, the server sends `ready` with its current version so a client can decide whether its currently loaded bundle is stale.

The development server is local-network tooling. Simulator/device loopback and LAN behavior must be tested explicitly; simulator timings are never physical-device performance evidence.

## Native app milestones

### Android

- native launcher Activity in Kotlin;
- URL entry + recent development servers;
- `sting://go` intent filter;
- manifest fetch and validation;
- bundle fetch;
- official QuickJS Sting runtime creation;
- real native renderer root;
- reload/error UI;
- connected physical-device test.

### iOS

- native launcher controller in Swift/UIKit;
- URL entry + recent development servers;
- `sting://go` URL scheme;
- manifest fetch using `URLSession`;
- bundle fetch;
- official `StingQuickJSRuntime` integration;
- real UIKit renderer root;
- reload/error UI;
- Simulator test first; physical iPhone validation when hardware is available.

## Compatibility

Sting Go must refuse an incompatible project with a useful error instead of attempting to run it. The manifest protocol is deliberately versioned from the beginning so the client can negotiate runtime and standard-SDK compatibility later.

Custom native modules are not a reason to weaken the protocol: they belong in project-specific development builds.
