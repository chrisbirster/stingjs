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

  private nextNodeId = 1;
  private readonly events = new Map<number, Map<string, EventHandler>>();
  private readonly properties = new Map<number, Map<string, string>>();
  private readonly retiredNodeIds = new Set<number>();

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
    this.assertUsable(node);
    if (!node.isText) throw new TypeError('replaceText requires a Sting text node');

    // Solid is free to reevaluate a text binding more than once while async
    // state settles. Crossing the native boundary with an identical string is
    // still wasted work, so the Sting shadow tree owns this final dedupe.
    if (node.textValue === value) return;

    node.textValue = value;
    this.bridge.replaceText(node.id, value);
  }

  setProperty(node: HostNode, name: string, value: unknown): void {
    this.assertUsable(node);

    const eventName = eventNameFromProperty(name);
    if (eventName) {
      this.setEventProperty(node, eventName, value);
      return;
    }

    const encodedValue = encodeNativeValue(value);
    const properties = this.properties.get(node.id) ?? new Map<string, string>();
    if (properties.get(name) === encodedValue) return;

    properties.set(name, encodedValue);
    this.properties.set(node.id, properties);
    this.bridge.setProperty(node.id, name, encodedValue);
  }

  insertNode(parent: HostNode, node: HostNode, anchor?: HostNode | null): void {
    this.assertUsable(parent);
    this.assertUsable(node);
    if (anchor) this.assertUsable(anchor);

    if (anchor && anchor.parent !== parent) {
      throw new Error('Sting renderer anchor must be a child of the target parent');
    }

    if (node === parent) throw new Error('A Sting node cannot contain itself');
    if (this.containsNode(node, parent)) {
      throw new Error('A Sting node cannot be inserted into one of its descendants');
    }

    // Inserting a node immediately before itself, immediately before its
    // existing next sibling, or at an end it already occupies is a structural
    // no-op. Do not replay a meaningless move over the native boundary.
    if (anchor === node) return;
    if (node.parent === parent) {
      const currentIndex = parent.children.indexOf(node);
      if (currentIndex >= 0) {
        if (anchor) {
          if (parent.children[currentIndex + 1] === anchor) return;
        } else if (currentIndex === parent.children.length - 1) {
          return;
        }
      }
    }

    if (node.parent) {
      const previousIndex = node.parent.children.indexOf(node);
      if (previousIndex >= 0) node.parent.children.splice(previousIndex, 1);
    }

    const anchorIndex = anchor ? parent.children.indexOf(anchor) : -1;
    const insertionIndex = anchorIndex >= 0 ? anchorIndex : parent.children.length;
    parent.children.splice(insertionIndex, 0, node);
    node.parent = parent;

    this.bridge.insertNode(parent.id, node.id, anchor?.id ?? -1);
  }

  removeNode(parent: HostNode, node: HostNode): void {
    this.assertUsable(parent);
    this.assertUsable(node);

    const index = parent.children.indexOf(node);
    if (index < 0 || node.parent !== parent) {
      throw new Error('Cannot remove a node that is not a child of the supplied parent');
    }

    parent.children.splice(index, 1);
    node.parent = null;

    // A native remove owns the complete subtree. Event callbacks must be
    // disabled while every native descendant still exists, then all JS-side
    // caches and node identities are retired before the removal crosses the
    // bridge. This prevents ghost callbacks and accidental node resurrection.
    this.disableEventsForSubtree(node);
    this.clearPropertiesForSubtree(node);
    this.retireSubtree(node);
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
    if (this.retiredNodeIds.has(nodeId)) return;
    this.events.get(nodeId)?.get(event)?.(payload);
  }

  callModuleSync(module: string, method: string, args: NativeValue[] = []): NativeValue | undefined {
    const response = decodeNativeCallResponse(
      this.bridge.callModuleSync(module, method, encodeNativeValue(args)),
    );

    if (!response.ok) throw new StingNativeError(response.error);
    return response.value;
  }

  private createHostNode(type: string, isText: boolean, textValue: string | null): HostNode {
    return {
      id: this.nextNodeId++,
      type,
      isText,
      parent: null,
      children: [],
      textValue,
    };
  }

  private assertUsable(node: HostNode): void {
    if (node.id !== 0 && this.retiredNodeIds.has(node.id)) {
      throw new Error(`Sting node ${node.id} has been removed and cannot be reused`);
    }
  }

  private containsNode(root: HostNode, target: HostNode): boolean {
    if (root === target) return true;
    for (const child of root.children) {
      if (this.containsNode(child, target)) return true;
    }
    return false;
  }

  private disableEventsForSubtree(node: HostNode): void {
    for (const child of node.children) this.disableEventsForSubtree(child);

    const handlers = this.events.get(node.id);
    if (!handlers) return;

    for (const event of handlers.keys()) {
      this.bridge.setEventEnabled(node.id, event, false);
    }
    this.events.delete(node.id);
  }

  private clearPropertiesForSubtree(node: HostNode): void {
    for (const child of node.children) this.clearPropertiesForSubtree(child);
    this.properties.delete(node.id);
  }

  private retireSubtree(node: HostNode): void {
    for (const child of node.children) this.retireSubtree(child);
    this.retiredNodeIds.add(node.id);
  }

  private setEventProperty(node: HostNode, event: string, value: unknown): void {
    const existingHandlers = this.events.get(node.id);

    if (value == null) {
      if (!existingHandlers?.has(event)) return;

      existingHandlers.delete(event);
      if (existingHandlers.size === 0) this.events.delete(node.id);
      this.bridge.setEventEnabled(node.id, event, false);
      return;
    }

    if (typeof value !== 'function') {
      throw new TypeError(`Event property on${event[0]?.toUpperCase() ?? ''}${event.slice(1)} must be a function`);
    }

    const handlers = existingHandlers ?? new Map<string, EventHandler>();
    const wasEnabled = handlers.has(event);
    handlers.set(event, value as EventHandler);
    this.events.set(node.id, handlers);

    // Handler replacement is entirely a JS-side identity change. Native only
    // needs to hear about the disabled->enabled edge once.
    if (!wasEnabled) this.bridge.setEventEnabled(node.id, event, true);
  }
}
