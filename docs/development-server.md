# Sting development server

`sting start` serves a built Sting application bundle for Sting Go and developer-client workflows.

```bash
sting start
sting start --project-root ./apps/my-app
sting start --bundle dist/sting-app.js
sting start --host 0.0.0.0 --port 8081
```

The server exposes:

- `GET /manifest` — Sting Go manifest and capability metadata.
- `GET /bundle` — the current JavaScript application bundle with caching disabled.
- `GET /events` — Server-Sent Events (SSE) reload stream.
- `GET /health` — server state including whether bundle watching is enabled and the current reload version.

The CLI prints a `sting://go?...` deep link that points Sting Go at the manifest URL.

## Watch mode

Use `--watch` for the managed developer loop:

```bash
sting start --watch
```

Watch mode runs the application's normal `npm run build` once before the server starts. If that build fails, the server is not started. After the initial build succeeds, Sting launches `npm run build -- --watch` and watches the resolved bundle file for changes.

A bundle change increments the server reload version and broadcasts an SSE event:

```text
event: reload
data: {"version":1,"timestamp":1787936400000}
```

New or reconnected clients immediately receive a `ready` event containing the current reload version. This allows a developer client to reconnect after a network interruption without requiring engine-specific state in the protocol.

`GET /health` reports the same state:

```json
{
  "ok": true,
  "watching": true,
  "reloadVersion": 1
}
```

On `SIGINT` or `SIGTERM`, the CLI stops the managed build watcher, closes active SSE responses, removes the bundle file watcher, and closes the HTTP server.

## Configuration

The default bundle path is `dist/sting-app.js`. A configured `bundle` in `sting.config.ts` overrides that default, and an explicit `--bundle` flag overrides config.

`--watch` deliberately consumes the application's public build contract rather than invoking Vite or another bundler privately. Projects can choose their build implementation as long as `npm run build` performs an initial build and accepts `--watch` through the normal npm argument-forwarding convention.
