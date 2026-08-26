import { STING_PROTOCOL_VERSION, type StingNativeBridge } from '@stingjs/core';

export type NativeOperation =
  | { kind: 'createElement'; id: number; type: string }
  | { kind: 'createTextNode'; id: number; value: string }
  | { kind: 'replaceText'; id: number; value: string }
  | { kind: 'setProperty'; id: number; name: string; valueJSON: string }
  | { kind: 'insertNode'; parentId: number; nodeId: number; anchorId: number }
  | { kind: 'removeNode'; parentId: number; nodeId: number }
  | { kind: 'setEventEnabled'; id: number; event: string; enabled: boolean };

export interface NativeMutationCounts {
  readonly createElement: number;
  readonly createTextNode: number;
  readonly replaceText: number;
  readonly setProperty: number;
  readonly insertNode: number;
  readonly removeNode: number;
  readonly eventEnable: number;
  readonly eventDisable: number;
  readonly moduleCalls: number;
}

export interface NativeModuleCall {
  readonly module: string;
  readonly method: string;
  readonly argsJSON: string;
}

export interface TreeValidation {
  readonly valid: boolean;
  readonly detail: string;
}

export class RealAppProbeBridge implements StingNativeBridge {
  readonly operations: NativeOperation[] = [];
  readonly moduleCalls: NativeModuleCall[] = [];

  private readonly nodeTypes = new Map<number, string>();
  private readonly textValues = new Map<number, string>();
  private readonly properties = new Map<number, Map<string, unknown>>();
  private readonly children = new Map<number, number[]>([[0, []]]);
  private readonly parents = new Map<number, number>();
  private readonly enabledEvents = new Set<string>();

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: { Haptics: '1' },
    });
  }

  createElement(id: number, type: string): void {
    this.operations.push({ kind: 'createElement', id, type });
    this.nodeTypes.set(id, type);
    this.properties.set(id, new Map());
    this.children.set(id, []);
  }

  createTextNode(id: number, value: string): void {
    this.operations.push({ kind: 'createTextNode', id, value });
    this.nodeTypes.set(id, '#text');
    this.textValues.set(id, value);
    this.properties.set(id, new Map());
    this.children.set(id, []);
  }

  replaceText(id: number, value: string): void {
    this.operations.push({ kind: 'replaceText', id, value });
    this.textValues.set(id, value);
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    this.operations.push({ kind: 'setProperty', id, name, valueJSON });
    let value: unknown = null;
    try {
      value = JSON.parse(valueJSON) as unknown;
    } catch {
      value = valueJSON;
    }
    const nodeProperties = this.properties.get(id) ?? new Map<string, unknown>();
    nodeProperties.set(name, value);
    this.properties.set(id, nodeProperties);
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
    const previousParentId = this.parents.get(nodeId);
    if (previousParentId !== undefined) {
      const previousSiblings = this.children.get(previousParentId);
      if (previousSiblings) {
        const previousIndex = previousSiblings.indexOf(nodeId);
        if (previousIndex >= 0) previousSiblings.splice(previousIndex, 1);
      }
    }

    const siblings = this.children.get(parentId) ?? [];
    const anchorIndex = anchorId >= 0 ? siblings.indexOf(anchorId) : -1;
    const insertionIndex = anchorIndex >= 0 ? anchorIndex : siblings.length;
    siblings.splice(insertionIndex, 0, nodeId);
    this.children.set(parentId, siblings);
    this.parents.set(nodeId, parentId);
  }

  removeNode(parentId: number, nodeId: number): void {
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
    const siblings = this.children.get(parentId);
    if (siblings) {
      const index = siblings.indexOf(nodeId);
      if (index >= 0) siblings.splice(index, 1);
    }
    this.parents.delete(nodeId);
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
    const key = `${id}:${event}`;
    if (enabled) this.enabledEvents.add(key);
    else this.enabledEvents.delete(key);
  }

  callModuleSync(module: string, method: string, argsJSON: string): string {
    this.moduleCalls.push({ module, method, argsJSON });
    return JSON.stringify({ ok: true, value: null });
  }

  clearOperations(): void {
    this.operations.length = 0;
    this.moduleCalls.length = 0;
  }

  counts(): NativeMutationCounts {
    let createElement = 0;
    let createTextNode = 0;
    let replaceText = 0;
    let setProperty = 0;
    let insertNode = 0;
    let removeNode = 0;
    let eventEnable = 0;
    let eventDisable = 0;

    for (const operation of this.operations) {
      switch (operation.kind) {
        case 'createElement':
          createElement += 1;
          break;
        case 'createTextNode':
          createTextNode += 1;
          break;
        case 'replaceText':
          replaceText += 1;
          break;
        case 'setProperty':
          setProperty += 1;
          break;
        case 'insertNode':
          insertNode += 1;
          break;
        case 'removeNode':
          removeNode += 1;
          break;
        case 'setEventEnabled':
          if (operation.enabled) eventEnable += 1;
          else eventDisable += 1;
          break;
      }
    }

    return {
      createElement,
      createTextNode,
      replaceText,
      setProperty,
      insertNode,
      removeNode,
      eventEnable,
      eventDisable,
      moduleCalls: this.moduleCalls.length,
    };
  }

  connectedNodeIds(): number[] {
    const result: number[] = [];
    const seen = new Set<number>();
    const visit = (id: number): void => {
      for (const childId of this.children.get(id) ?? []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        result.push(childId);
        visit(childId);
      }
    };
    visit(0);
    return result;
  }

  isConnected(id: number): boolean {
    return this.connectedNodeIds().includes(id);
  }

  findConnectedByLabel(label: string): number | undefined {
    for (const id of this.connectedNodeIds()) {
      if (this.properties.get(id)?.get('accessibilityLabel') === label) return id;
    }
    return undefined;
  }

  requireConnectedByLabel(label: string): number {
    const id = this.findConnectedByLabel(label);
    if (id === undefined) throw new Error(`No connected native node has accessibilityLabel=${label}`);
    return id;
  }

  connectedIdsWithLabelPrefix(prefix: string): number[] {
    const ids: number[] = [];
    for (const id of this.connectedNodeIds()) {
      const label = this.properties.get(id)?.get('accessibilityLabel');
      if (typeof label === 'string' && label.startsWith(prefix)) ids.push(id);
    }
    return ids;
  }

  labelForNode(id: number): string | undefined {
    const label = this.properties.get(id)?.get('accessibilityLabel');
    return typeof label === 'string' ? label : undefined;
  }

  directChildren(id: number): readonly number[] {
    return this.children.get(id) ?? [];
  }

  connectedChildrenWithLabelPrefix(parentId: number, prefix: string): number[] {
    const connected = new Set(this.connectedNodeIds());
    return (this.children.get(parentId) ?? []).filter(childId => {
      if (!connected.has(childId)) return false;
      const label = this.properties.get(childId)?.get('accessibilityLabel');
      return typeof label === 'string' && label.startsWith(prefix);
    });
  }

  textForLabel(label: string): string | undefined {
    const rootId = this.findConnectedByLabel(label);
    if (rootId === undefined) return undefined;
    const values: string[] = [];
    const visit = (id: number): void => {
      if (this.nodeTypes.get(id) === '#text') {
        values.push(this.textValues.get(id) ?? '');
      }
      for (const childId of this.children.get(id) ?? []) visit(childId);
    };
    visit(rootId);
    return values.join('');
  }

  validateConnectedTree(): TreeValidation {
    const seen = new Set<number>();
    const stack = new Set<number>();
    let detail = 'ok';

    const visit = (parentId: number): boolean => {
      const siblings = this.children.get(parentId) ?? [];
      const siblingSet = new Set<number>();
      for (const childId of siblings) {
        if (siblingSet.has(childId)) {
          detail = `duplicate child ${childId} under parent ${parentId}`;
          return false;
        }
        siblingSet.add(childId);
        if (this.parents.get(childId) !== parentId) {
          detail = `parent mismatch for child ${childId}: expected ${parentId}, got ${String(this.parents.get(childId))}`;
          return false;
        }
        if (stack.has(childId)) {
          detail = `cycle detected at node ${childId}`;
          return false;
        }
        if (seen.has(childId)) {
          detail = `connected node ${childId} appears more than once`;
          return false;
        }
        seen.add(childId);
        stack.add(childId);
        if (!visit(childId)) return false;
        stack.delete(childId);
      }
      return true;
    };

    return { valid: visit(0), detail };
  }
}
