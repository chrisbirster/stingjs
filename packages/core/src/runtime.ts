import { decodeNativeValue, type StingNativeBridge } from './bridge.js';
import { StingHost } from './host.js';
import { STING_PROTOCOL_VERSION } from './types.js';

let activeHost: StingHost | undefined;

declare global {
  // Installed by the native runtime before the application bundle evaluates.
  var __stingNativeBridge: StingNativeBridge | undefined;

  // Called by the native runtime when a native event occurs.
  var __stingDispatchEvent: ((nodeId: number, event: string, payloadJSON: string) => void) | undefined;
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

  activeHost = host;
  globalThis.__stingDispatchEvent = (nodeId, event, payloadJSON) => {
    host.dispatchEvent(nodeId, event, decodeNativeValue(payloadJSON));
  };
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
  activeHost = undefined;
  globalThis.__stingDispatchEvent = undefined;
}
