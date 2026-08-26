import {
  STING_PROTOCOL_VERSION,
  installNativeBridge,
  resetNativeBridgeForTests,
  type HostNode,
  type StingHost,
  type StingNativeBridge,
} from '@stingjs/core';

export type TraceOperation =
  | { kind: 'createElement'; id: number; type: string }
  | { kind: 'createTextNode'; id: number; value: string }
  | { kind: 'replaceText'; id: number; value: string }
  | { kind: 'setProperty'; id: number; name: string; value: unknown }
  | { kind: 'insertNode'; parentId: number; nodeId: number; anchorId: number }
  | { kind: 'removeNode'; parentId: number; nodeId: number }
  | { kind: 'setEventEnabled'; id: number; event: string; enabled: boolean };

export interface MutationCounts {
  createElement: number;
  createTextNode: number;
  replaceText: number;
  setProperty: number;
  insertNode: number;
  removeNode: number;
  setEventEnabled: number;
}

const EMPTY_COUNTS: MutationCounts = {
  createElement: 0,
  createTextNode: 0,
  replaceText: 0,
  setProperty: 0,
  insertNode: 0,
  removeNode: 0,
  setEventEnabled: 0,
};

export class TraceNativeBridge implements StingNativeBridge {
  readonly operations: TraceOperation[] = [];
  readonly properties = new Map<number, Map<string, unknown>>();
  readonly types = new Map<number, string>();
  readonly lastParent = new Map<number, number>();

  getRuntimeInfo(): string {
    return JSON.stringify({
      protocolVersion: STING_PROTOCOL_VERSION,
      platform: 'ios',
      modules: {},
    });
  }

  createElement(id: number, type: string): void {
    this.types.set(id, type);
    this.operations.push({ kind: 'createElement', id, type });
  }

  createTextNode(id: number, value: string): void {
    this.types.set(id, '#text');
    this.operations.push({ kind: 'createTextNode', id, value });
  }

  replaceText(id: number, value: string): void {
    this.operations.push({ kind: 'replaceText', id, value });
  }

  setProperty(id: number, name: string, valueJSON: string): void {
    const value = JSON.parse(valueJSON) as unknown;
    const props = this.properties.get(id) ?? new Map<string, unknown>();
    props.set(name, value);
    this.properties.set(id, props);
    this.operations.push({ kind: 'setProperty', id, name, value });
  }

  insertNode(parentId: number, nodeId: number, anchorId: number): void {
    this.lastParent.set(nodeId, parentId);
    this.operations.push({ kind: 'insertNode', parentId, nodeId, anchorId });
  }

  removeNode(parentId: number, nodeId: number): void {
    this.lastParent.set(nodeId, parentId);
    this.operations.push({ kind: 'removeNode', parentId, nodeId });
  }

  setEventEnabled(id: number, event: string, enabled: boolean): void {
    this.operations.push({ kind: 'setEventEnabled', id, event, enabled });
  }

  callModuleSync(): string {
    return JSON.stringify({ ok: true, value: null });
  }

  mark(): number {
    return this.operations.length;
  }

  since(mark: number): TraceOperation[] {
    return this.operations.slice(mark);
  }

  accessibilityLabel(id: number): string | undefined {
    const value = this.properties.get(id)?.get('accessibilityLabel');
    return typeof value === 'string' ? value : undefined;
  }

  describeNode(id: number): string {
    const directLabel = this.accessibilityLabel(id);
    if (directLabel) return directLabel;

    const type = this.types.get(id);
    if (type === '#text') {
      const parentId = this.lastParent.get(id);
      if (parentId !== undefined) {
        const parentLabel = this.accessibilityLabel(parentId);
        if (parentLabel) return `${parentLabel}#text`;
      }
    }

    return `${type ?? 'node'}#${id}`;
  }

  structuralTrace(operations: readonly TraceOperation[]): string[] {
    const trace: string[] = [];

    for (const operation of operations) {
      if (operation.kind === 'insertNode') {
        trace.push(
          `insert ${this.describeNode(operation.parentId)}>${this.describeNode(operation.nodeId)} before ${
            operation.anchorId < 0 ? 'end' : this.describeNode(operation.anchorId)
          }`,
        );
      } else if (operation.kind === 'removeNode') {
        trace.push(`remove ${this.describeNode(operation.parentId)}>${this.describeNode(operation.nodeId)}`);
      } else if (operation.kind === 'replaceText') {
        trace.push(`replace ${this.describeNode(operation.id)}=${operation.value}`);
      }
    }

    return trace;
  }
}

export interface TraceHost {
  readonly bridge: TraceNativeBridge;
  readonly host: StingHost;
  dispose(): void;
}

export function createTraceHost(): TraceHost {
  resetNativeBridgeForTests();
  const bridge = new TraceNativeBridge();
  const host = installNativeBridge(bridge);

  return {
    bridge,
    host,
    dispose() {
      resetNativeBridgeForTests();
    },
  };
}

function walk(node: HostNode, visit: (node: HostNode) => boolean): HostNode | undefined {
  if (visit(node)) return node;
  for (const child of node.children) {
    const found = walk(child, visit);
    if (found) return found;
  }
  return undefined;
}

export function findNodeByLabel(
  host: StingHost,
  bridge: TraceNativeBridge,
  label: string,
): HostNode | undefined {
  return walk(host.root, node => bridge.accessibilityLabel(node.id) === label);
}

export function requireNodeByLabel(
  host: StingHost,
  bridge: TraceNativeBridge,
  label: string,
): HostNode {
  const node = findNodeByLabel(host, bridge, label);
  if (!node) throw new Error(`Expected visible native node with accessibilityLabel=${label}`);
  return node;
}

export function textContent(node: HostNode): string {
  if (node.isText) return node.textValue ?? '';
  return node.children.map(textContent).join('');
}

export function directChildLabels(
  host: StingHost,
  bridge: TraceNativeBridge,
  parentLabel: string,
): string[] {
  const parent = requireNodeByLabel(host, bridge, parentLabel);
  return parent.children.map(child => bridge.accessibilityLabel(child.id) ?? bridge.describeNode(child.id));
}

export function mutationCounts(operations: readonly TraceOperation[]): MutationCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const operation of operations) counts[operation.kind] += 1;
  return counts;
}

export function replayCountOnIds(
  operations: readonly TraceOperation[],
  ids: ReadonlySet<number>,
): number {
  let count = 0;
  for (const operation of operations) {
    if (
      (operation.kind === 'setProperty' || operation.kind === 'setEventEnabled') &&
      ids.has(operation.id)
    ) {
      count += 1;
    }
  }
  return count;
}
