import {
  decodeNativeCallResponse,
  decodeRuntimeInfo,
  encodeNativeValue,
  type StingNativeBridge,
} from './bridge.js';
import { StingNativeError } from './errors.js';
import type { NativeValue, StingRuntimeInfo } from './types.js';

export interface HostNode {
  readonly id: number;
  readonly type: string;
  readonly isText: boolean;
  parent: HostNode | null;
  children: HostNode[];
  textValue: string | null;
}

type EventHandler = (payload: NativeValue) => void;
type ModuleEventHandler = (payload: NativeValue) => void;

type PendingModuleCall = {
  readonly module: string;
  readonly method: string;
  readonly resolve: (value: NativeValue | undefined) => void;
  readonly reject: (reason: unknown) => void;
};

// Native registries retain retired node identities for stale-callback and
// ghost-node protection. IDs therefore belong to the JavaScript runtime
// lifetime, not to an individual StingHost instance.
let nextNativeNodeId = 1;

// Async native completions can arrive after a host is replaced or disposed.
// Never reuse request IDs inside the JavaScript process so a stale completion
// cannot accidentally settle a newer call owned by another host instance.
let nextNativeModuleRequestId = 1;

function eventNameFromProperty(name: string): string | null {
  if (!name.startsWith('on') || name.length <= 2) return null;
  const raw = name.slice(2);
  const first = raw[0];
  if (!first || first !== first.toUpperCase()) return null;
  return first.toLowerCase() + raw.slice(1);
}

export class StingHost {
  readonly root: HostNode = {
    id: 0,
    type: 'root',
    isText: false,
    parent: null,
    children: [],
    textValue: null,
  };

  // `events` contains only handlers that are currently dispatchable. Solid's
  // keyed universal reconciler may temporarily remove an existing node and
  // later reinsert the same identity while reordering an array. Keep the source
  // handlers in a WeakMap so such structural moves can reactivate them without
  // retaining permanently removed nodes forever.
  private readonly events = new Map<number, Map<string, EventHandler>>();
  private readonly retainedEvents = new WeakMap<HostNode, Map<string, EventHandler>>();
  private readonly deactivatedNodes = new WeakSet<HostNode>();
  private readonly pendingModuleCalls = new Map<number, PendingModuleCall>();
  private readonly moduleEvents = new Map<string, Map<string, Set<ModuleEventHandler>>>();
  private disposed = false;

  constructor(readonly bridge: StingNativeBridge) {}

  getRuntimeInfo(): StingRuntimeInfo {
    return decodeRuntimeInfo(this.bridge.getRuntimeInfo());
  }

  createElement(type: string): HostNode {
    const node = this.createHostNode(type, false, null);
    this.bridge.createElement(node.id, type);
    return node;
  }

  createTextNode(value: string): HostNode {
    const node = this.createHostNode('#text', true, value);
    this.bridge.createTextNode(node.id, value);
    return node;
  }

  replaceText(node: HostNode, value: string): void {
    if (!node.isText) throw new TypeError('replaceText requires a Sting text node');

    // Solid is free to reevaluate a text binding more than once while async
    // state settles. Crossing the native boundary with an identical string is
    // still wasted work, so the Sting shadow tree owns this final dedupe.
    if (node.textValue === value) return;

    node.textValue = value;
    this.bridge.replaceText(node.id, value);
  }

  setProperty(node: HostNode, name: string, value: unknown): void {
    const eventName = eventNameFromProperty(name);
    if (eventName) {
      this.setEventProperty(node, eventName, value);
      return;
    }

    this.bridge.setProperty(node.id, name, encodeNativeValue(value));
  }

  insertNode(parent: HostNode, node: HostNode, anchor?: HostNode | null): void {
    if (anchor && anchor.parent !== parent) {
      throw new Error('Sting renderer anchor must be a child of the target parent');
    }

    if (node === parent) throw new Error('A Sting node cannot contain itself');

    if (node.parent) {
      const previousIndex = node.parent.children.indexOf(node);
      if (previousIndex >= 0) node.parent.children.splice(previousIndex, 1);
    }

    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
    const insertionIndex = anchorIndex >= 0 ? anchorIndex : parent.children.length;
    parent.children.splice(insertionIndex, 0, node);
    node.parent = parent;

    this.bridge.insertNode(parent.id, node.id, anchor?.id ?? -1);
    this.reactivateEventsForSubtree(node);
  }

  removeNode(parent: HostNode, node: HostNode): void {
    const index = parent.children.indexOf(node);
    if (index < 0 || node.parent !== parent) {
      throw new Error('Cannot remove a node that is not a child of the supplied parent');
    }

    parent.children.splice(index, 1);
    node.parent = null;

    // Universal keyed reconciliation can express a move as remove + later
    // reinsert of the same host identity. Disable dispatch before the native
    // detach, but retain the source handlers weakly so reinsert can restore
    // them. A permanently removed subtree remains non-dispatchable, and the
    // WeakMap does not keep it alive after Solid releases the node objects.
    this.deactivateEventsForSubtree(node);
    this.bridge.removeNode(parent.id, node.id);
  }

  isTextNode(node: HostNode): boolean {
    return node.isText;
  }

  getParentNode(node: HostNode): HostNode | undefined {
    return node.parent ?? undefined;
  }

  getFirstChild(node: HostNode): HostNode | undefined {
    return node.children[0];
  }

  getNextSibling(node: HostNode): HostNode | undefined {
    const parent = node.parent;
    if (!parent) return undefined;
    const index = parent.children.indexOf(node);
    return index >= 0 ? parent.children[index + 1] : undefined;
  }

  dispatchEvent(nodeId: number, event: string, payload: NativeValue = null): void {
    this.events.get(nodeId)?.get(event)?.(payload);
  }

  callModuleSync(module: string, method: string, args: NativeValue[] = []): NativeValue | undefined {
    const response = decodeNativeCallResponse(
      this.bridge.callModuleSync(module, method, encodeNativeValue(args)),
    );

    if (!response.ok) throw new StingNativeError(response.error);
    return response.value;
  }

  callModuleAsync(
    module: string,
    method: string,
    args: NativeValue[] = [],
  ): Promise<NativeValue | undefined> {
    if (this.disposed) {
      return Promise.reject(this.runtimeDisposedError(module, method));
    }

    if (!this.bridge.callModuleAsync) {
      return Promise.reject(new StingNativeError({
        code: 'E_ASYNC_UNSUPPORTED',
        message: 'This Sting native host does not support asynchronous native-module calls.',
        module,
        method,
      }));
    }

    const requestId = nextNativeModuleRequestId++;

    return new Promise<NativeValue | undefined>((resolve, reject) => {
      this.pendingModuleCalls.set(requestId, { module, method, resolve, reject });

      try {
        this.bridge.callModuleAsync!(module, method, encodeNativeValue(args), requestId);
      } catch (error) {
        this.pendingModuleCalls.delete(requestId);
        reject(error);
      }
    });
  }

  completeModuleAsync(requestId: number, responseJSON: string): boolean {
    const pending = this.pendingModuleCalls.get(requestId);
    if (!pending) return false;

    // Delete before parsing/settling so duplicate or re-entrant completions can
    // never observe the request as pending and settle the same Promise twice.
    this.pendingModuleCalls.delete(requestId);

    let response;
    try {
      response = decodeNativeCallResponse(responseJSON);
    } catch (error) {
      pending.reject(error);
      return true;
    }

    if (!response.ok) {
      pending.reject(new StingNativeError(response.error));
    } else {
      pending.resolve(response.value);
    }
    return true;
  }

  addModuleEventListener(
    module: string,
    event: string,
    handler: ModuleEventHandler,
  ): () => void {
    if (this.disposed) {
      throw this.runtimeDisposedError(module, `addListener:${event}`);
    }
    if (!event) throw new TypeError('Native module event name must not be empty');
    if (!this.bridge.setModuleEventEnabled) {
      throw new StingNativeError({
        code: 'E_EVENTS_UNSUPPORTED',
        message: 'This Sting native host does not support native-module events.',
        module,
        method: `addListener:${event}`,
      });
    }

    let eventsForModule = this.moduleEvents.get(module);
    let listeners = eventsForModule?.get(event);

    if (!listeners) {
      this.setNativeModuleEventEnabled(module, event, true);
      if (!eventsForModule) {
        eventsForModule = new Map<string, Set<ModuleEventHandler>>();
        this.moduleEvents.set(module, eventsForModule);
      }
      listeners = new Set<ModuleEventHandler>();
      eventsForModule.set(event, listeners);
    }

    // Wrap each subscription so repeated addListener() calls with the same
    // callback remain independent removable handles.
    const subscriptionHandler: ModuleEventHandler = (payload) => handler(payload);
    listeners.add(subscriptionHandler);
    let removed = false;

    return () => {
      if (removed) return;
      removed = true;

      const currentEvents = this.moduleEvents.get(module);
      const currentListeners = currentEvents?.get(event);
      if (!currentListeners) return;

      currentListeners.delete(subscriptionHandler);
      if (currentListeners.size > 0) return;

      // Remove JS dispatchability before asking native to stop observation so a
      // re-entrant or racing callback is stale immediately.
      currentEvents!.delete(event);
      if (currentEvents!.size === 0) this.moduleEvents.delete(module);
      this.setNativeModuleEventEnabled(module, event, false);
    };
  }

  dispatchModuleEvent(module: string, event: string, payload: NativeValue = null): boolean {
    if (this.disposed) return false;
    const listeners = this.moduleEvents.get(module)?.get(event);
    if (!listeners || listeners.size === 0) return false;

    // Snapshot before dispatch. A listener may unsubscribe itself or another
    // listener while handling the event; that must not corrupt this delivery.
    for (const listener of [...listeners]) listener(payload);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Clear first so a re-entrant/stale native completion during rejection is
    // ignored rather than observing a request that is already being disposed.
    const pendingCalls = [...this.pendingModuleCalls.values()];
    this.pendingModuleCalls.clear();

    for (const pending of pendingCalls) {
      pending.reject(this.runtimeDisposedError(pending.module, pending.method));
    }

    const activeModuleEvents = [...this.moduleEvents.entries()].flatMap(([module, events]) =>
      [...events.keys()].map((event) => ({ module, event })),
    );
    this.moduleEvents.clear();

    for (const { module, event } of activeModuleEvents) {
      try {
        this.setNativeModuleEventEnabled(module, event, false);
      } catch {
        // Runtime teardown must remain idempotent and continue clearing every
        // observation even if one native module reports a disable error.
      }
    }

    this.events.clear();
  }

  private setNativeModuleEventEnabled(module: string, event: string, enabled: boolean): void {
    if (!this.bridge.setModuleEventEnabled) {
      throw new StingNativeError({
        code: 'E_EVENTS_UNSUPPORTED',
        message: 'This Sting native host does not support native-module events.',
        module,
        method: `addListener:${event}`,
      });
    }

    const response = decodeNativeCallResponse(
      this.bridge.setModuleEventEnabled(module, event, enabled),
    );
    if (!response.ok) throw new StingNativeError(response.error);
  }

  private runtimeDisposedError(module: string, method: string): StingNativeError {
    return new StingNativeError({
      code: 'E_RUNTIME_DISPOSED',
      message: 'Sting runtime was disposed before the native operation completed.',
      module,
      method,
    });
  }

  private createHostNode(type: string, isText: boolean, textValue: string | null): HostNode {
    return {
      id: nextNativeNodeId++,
      type,
      isText,
      parent: null,
      children: [],
      textValue,
    };
  }

  private deactivateEventsForSubtree(node: HostNode): void {
    for (const child of node.children) this.deactivateEventsForSubtree(child);

    this.deactivatedNodes.add(node);
    const handlers = this.events.get(node.id);
    if (!handlers) return;

    // Delete first so even a re-entrant native callback during disable cannot
    // observe a handler for a subtree Solid has already detached.
    this.events.delete(node.id);
    for (const event of handlers.keys()) {
      this.bridge.setEventEnabled(node.id, event, false);
    }
  }

  private reactivateEventsForSubtree(node: HostNode): void {
    this.deactivatedNodes.delete(node);

    const retained = this.retainedEvents.get(node);
    if (retained && retained.size > 0 && !this.events.has(node.id)) {
      this.events.set(node.id, retained);
      for (const event of retained.keys()) {
        this.bridge.setEventEnabled(node.id, event, true);
      }
    }

    for (const child of node.children) this.reactivateEventsForSubtree(child);
  }

  private setEventProperty(node: HostNode, event: string, value: unknown): void {
    const retained = this.retainedEvents.get(node) ?? new Map<string, EventHandler>();

    if (value == null) {
      retained.delete(event);
      if (retained.size === 0) this.retainedEvents.delete(node);
      else this.retainedEvents.set(node, retained);

      const active = this.events.get(node.id);
      active?.delete(event);
      if (active?.size === 0) this.events.delete(node.id);
      this.bridge.setEventEnabled(node.id, event, false);
      return;
    }

    if (typeof value !== 'function') {
      throw new TypeError(`Event property on${event[0]?.toUpperCase() ?? ''}${event.slice(1)} must be a function`);
    }

    retained.set(event, value as EventHandler);
    this.retainedEvents.set(node, retained);

    // A node removed by keyed reconciliation remains deliberately inactive
    // until it is inserted again. Newly created nodes preserve the existing
    // Sting behavior of registering event capability before first insertion.
    if (this.deactivatedNodes.has(node)) return;

    const active = this.events.get(node.id) ?? new Map<string, EventHandler>();
    active.set(event, value as EventHandler);
    this.events.set(node.id, active);
    this.bridge.setEventEnabled(node.id, event, true);
  }
}
