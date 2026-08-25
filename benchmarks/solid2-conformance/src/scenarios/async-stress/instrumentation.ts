import { getHost, type HostNode, type StingHost } from '@stingjs/core';
import type { ScenarioContext } from '../../harness/types.js';

interface MutationRecord {
  readonly kind:
    | 'createElement'
    | 'createTextNode'
    | 'replaceText'
    | 'setProperty'
    | 'insertNode'
    | 'removeNode';
  readonly nodeId?: number;
  readonly value?: string;
}

export interface HostInstrumentation {
  readonly host: StingHost;
  readonly mutations: MutationRecord[];
  mark(): number;
  since(mark: number): MutationRecord[];
  restore(): void;
}

interface BenchmarkSummary {
  readonly samples: number;
  readonly min: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function instrumentHost(): HostInstrumentation {
  const host = getHost();
  const mutations: MutationRecord[] = [];

  // Preserve the original method objects exactly. The wrappers use call(host)
  // while installed, and restore() puts the same method identities back so a
  // conformance run leaves the shared Sting host untouched for later suites.
  const createElement = host.createElement;
  const createTextNode = host.createTextNode;
  const replaceText = host.replaceText;
  const setProperty = host.setProperty;
  const insertNode = host.insertNode;
  const removeNode = host.removeNode;

  host.createElement = (type: string) => {
    const node = createElement.call(host, type);
    mutations.push({ kind: 'createElement', nodeId: node.id });
    return node;
  };
  host.createTextNode = (value: string) => {
    const node = createTextNode.call(host, value);
    mutations.push({ kind: 'createTextNode', nodeId: node.id, value });
    return node;
  };
  host.replaceText = (node: HostNode, value: string) => {
    const before = node.textValue;
    replaceText.call(host, node, value);
    if (before !== value) mutations.push({ kind: 'replaceText', nodeId: node.id, value });
  };
  host.setProperty = (node: HostNode, name: string, value: unknown) => {
    setProperty.call(host, node, name, value);
    mutations.push({ kind: 'setProperty', nodeId: node.id, value: name });
  };
  host.insertNode = (parent: HostNode, node: HostNode, anchor?: HostNode | null) => {
    insertNode.call(host, parent, node, anchor);
    mutations.push({ kind: 'insertNode', nodeId: node.id });
  };
  host.removeNode = (parent: HostNode, node: HostNode) => {
    removeNode.call(host, parent, node);
    mutations.push({ kind: 'removeNode', nodeId: node.id });
  };

  return {
    host,
    mutations,
    mark: () => mutations.length,
    since: mark => mutations.slice(mark),
    restore() {
      host.createElement = createElement;
      host.createTextNode = createTextNode;
      host.replaceText = replaceText;
      host.setProperty = setProperty;
      host.insertNode = insertNode;
      host.removeNode = removeNode;
    },
  };
}

function collectTextNodes(node: HostNode, into: HostNode[] = []): HostNode[] {
  if (node.isText) into.push(node);
  for (const child of node.children) collectTextNodes(child, into);
  return into;
}

export function findTextNode(root: HostNode, value: string): HostNode | undefined {
  return collectTextNodes(root).find(node => node.textValue === value);
}

export function hasText(root: HostNode, value: string): boolean {
  return findTextNode(root, value) !== undefined;
}

export function hasTextContaining(root: HostNode, value: string): boolean {
  return collectTextNodes(root).some(node => node.textValue?.includes(value) === true);
}

function replaceTextMutations(mutations: MutationRecord[]): MutationRecord[] {
  return mutations.filter(mutation => mutation.kind === 'replaceText');
}

export function assertOnlyReplaceText(
  context: ScenarioContext,
  name: string,
  mutations: MutationRecord[],
  expectedCount: number,
): void {
  const replacements = replaceTextMutations(mutations);
  context.assert(
    `${name}: exact replaceText count`,
    replacements.length === expectedCount,
    `expected ${expectedCount}, got ${replacements.length}: ${JSON.stringify(mutations)}`,
  );
  context.assert(
    `${name}: no structural/property replay`,
    mutations.length === replacements.length,
    JSON.stringify(mutations),
  );
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

function summarizeSamples(samples: number[]): BenchmarkSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    samples: sorted.length,
    min: sorted[0] ?? 0,
    mean: sorted.length === 0 ? 0 : sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function recordSummary(
  context: ScenarioContext,
  name: string,
  summary: BenchmarkSummary,
  unit: string,
): void {
  context.metric(`${name}.samples`, summary.samples, 'count');
  context.metric(`${name}.min`, summary.min, unit);
  context.metric(`${name}.mean`, summary.mean, unit);
  context.metric(`${name}.p50`, summary.p50, unit);
  context.metric(`${name}.p95`, summary.p95, unit);
  context.metric(`${name}.p99`, summary.p99, unit);
  context.metric(`${name}.max`, summary.max, unit);
}

interface BenchmarkIteration {
  run(): Promise<number>;
  cleanup(): Promise<void>;
}

export async function benchmark(
  context: ScenarioContext,
  name: string,
  prepare: () => Promise<BenchmarkIteration>,
  samples = 20,
): Promise<void> {
  const durations: number[] = [];
  const nativeMutations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const iteration = await prepare();
    const started = context.now();
    nativeMutations.push(await iteration.run());
    durations.push(Math.max(0, context.now() - started));
    await iteration.cleanup();
  }
  recordSummary(context, name, summarizeSamples(durations), 'ms');
  recordSummary(context, `${name}.native-mutations`, summarizeSamples(nativeMutations), 'count');
}
