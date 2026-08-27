import { decodeNativeValue, type StingNativeBridge } from './bridge.js';
import { StingHost } from './host.js';
import { STING_PROTOCOL_VERSION } from './types.js';

let activeHost: StingHost | undefined;
const runtimeDisposers = new WeakMap<StingHost, Set<() => void>>();

declare global {
  // Installed by the native runtime before the application bundle evaluates.
  var __stingNativeBridge: StingNativeBridge | undefined;

  // Called by the native runtime when a native view event occurs.
  var __stingDispatchEvent: ((nodeId: number, event: string, payloadJSON: string) => void) | undefined;

  // Called by the native runtime when a repeated native-module event occurs.
  // Returns false when no active listener exists for that module/event pair.
  var __stingDispatchModuleEvent:
    | ((module: string, event: string, payloadJSON: string) => boolean)
    | undefined;

  // Called by the native runtime when an asynchronous native-module request
  // completes. Returns false for stale/unknown request IDs.
  var __stingResolveModuleCall: ((requestId: number, responseJSON: string) => boolean) | undefined;

  // Called by a native runtime before its JavaScript engine/context is torn down.
  var __stingDisposeRuntime: (() => void) | undefined;
}

/**
 * Register a resource that must be released before its owning Sting host is
 * disposed. Modules-core uses this for native object handles; application code
 * should normally consume the higher-level module APIs instead.
 */
export function registerRuntimeDisposer(host: StingHost, disposer: () => void): () => void {
  let disposers = runtimeDisposers.get(host);
  if (!disposers) {
    disposers = new Set();
    runtimeDisposers.set(host, disposers);
  }

  disposers.add(disposer);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const current = runtimeDisposers.get(host);
    current?.delete(disposer);
    if (current?.size === 0) runtimeDisposers.delete(host);
  };
}

function disposeHost(host: StingHost): void {
  const disposers = [...(runtimeDisposers.get(host) ?? [])];
  runtimeDisposers.delete(host);

  // Clear registration before invoking callbacks so re-entrant teardown cannot
  // run the same native-resource disposer twice. One failing resource must not
  // prevent the rest of the runtime from being released.
  for (const disposer of disposers) {
    try {
      disposer();
    } catch {
      // Native registries provide a final teardown fallback. Explicit wrapper
      // disposal still reports errors to callers outside runtime teardown.
    }
  }

  host.dispose();
}

export function installNativeBridge(bridge: StingNativeBridge): StingHost {
  const host = new StingHost(bridge);
  const runtimeInfo = host.getRuntimeInfo();

  if (runtimeInfo.protocolVersion !== STING_PROTOCOL_VERSION) {
    throw new Error(
      `Incompatible Sting native runtime protocol ${runtimeInfo.protocolVersion}; ` +
        `JavaScript expects protocol ${STING_PROTOCOL_VERSION}.`,
    );
  }

  if (activeHost) disposeHost(activeHost);
  activeHost = host;

  const dispatchEvent = (nodeId: number, event: string, payloadJSON: string) => {
    host.dispatchEvent(nodeId, event, decodeNativeValue(payloadJSON));
  };
  const dispatchModuleEvent = (module: string, event: string, payloadJSON: string) =>
    host.dispatchModuleEvent(module, event, decodeNativeValue(payloadJSON));
  const resolveModuleCall = (requestId: number, responseJSON: string) =>
    host.completeModuleAsync(requestId, responseJSON);
  const disposeRuntime = () => {
    disposeHost(host);
    if (activeHost === host) activeHost = undefined;
    if (globalThis.__stingDispatchEvent === dispatchEvent) {
      globalThis.__stingDispatchEvent = undefined;
    }
    if (globalThis.__stingDispatchModuleEvent === dispatchModuleEvent) {
      globalThis.__stingDispatchModuleEvent = undefined;
    }
    if (globalThis.__stingResolveModuleCall === resolveModuleCall) {
      globalThis.__stingResolveModuleCall = undefined;
    }
    if (globalThis.__stingDisposeRuntime === disposeRuntime) {
      globalThis.__stingDisposeRuntime = undefined;
    }
  };

  globalThis.__stingDispatchEvent = dispatchEvent;
  globalThis.__stingDispatchModuleEvent = dispatchModuleEvent;
  globalThis.__stingResolveModuleCall = resolveModuleCall;
  globalThis.__stingDisposeRuntime = disposeRuntime;
  return host;
}

export function getHost(): StingHost {
  if (activeHost) return activeHost;

  const bridge = globalThis.__stingNativeBridge;
  if (!bridge) {
    throw new Error(
      'Sting native bridge is not installed. Run this bundle inside a Sting native host or install a test bridge first.',
    );
  }

  return installNativeBridge(bridge);
}

export function resetNativeBridgeForTests(): void {
  if (activeHost) disposeHost(activeHost);
  activeHost = undefined;
  globalThis.__stingDispatchEvent = undefined;
  globalThis.__stingDispatchModuleEvent = undefined;
  globalThis.__stingResolveModuleCall = undefined;
  globalThis.__stingDisposeRuntime = undefined;
}
