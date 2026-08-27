import { decodeNativeValue, type StingNativeBridge } from './bridge.js';
import { StingHost } from './host.js';
import { STING_PROTOCOL_VERSION } from './types.js';

let activeHost: StingHost | undefined;

declare global {
  // Installed by the native runtime before the application bundle evaluates.
  var __stingNativeBridge: StingNativeBridge | undefined;

  // Called by the native runtime when a native event occurs.
  var __stingDispatchEvent: ((nodeId: number, event: string, payloadJSON: string) => void) | undefined;

  // Called by the native runtime when an asynchronous native-module request
  // completes. Returns false for stale/unknown request IDs.
  var __stingResolveModuleCall: ((requestId: number, responseJSON: string) => boolean) | undefined;

  // Called by a native runtime before its JavaScript engine/context is torn down.
  var __stingDisposeRuntime: (() => void) | undefined;
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

  activeHost?.dispose();
  activeHost = host;

  const dispatchEvent = (nodeId: number, event: string, payloadJSON: string) => {
    host.dispatchEvent(nodeId, event, decodeNativeValue(payloadJSON));
  };
  const resolveModuleCall = (requestId: number, responseJSON: string) =>
    host.completeModuleAsync(requestId, responseJSON);
  const disposeRuntime = () => {
    host.dispose();
    if (activeHost === host) activeHost = undefined;
    if (globalThis.__stingDispatchEvent === dispatchEvent) {
      globalThis.__stingDispatchEvent = undefined;
    }
    if (globalThis.__stingResolveModuleCall === resolveModuleCall) {
      globalThis.__stingResolveModuleCall = undefined;
    }
    if (globalThis.__stingDisposeRuntime === disposeRuntime) {
      globalThis.__stingDisposeRuntime = undefined;
    }
  };

  globalThis.__stingDispatchEvent = dispatchEvent;
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
  activeHost?.dispose();
  activeHost = undefined;
  globalThis.__stingDispatchEvent = undefined;
  globalThis.__stingResolveModuleCall = undefined;
  globalThis.__stingDisposeRuntime = undefined;
}
