import { createRenderer } from '@solidjs/universal';
import { createRenderEffect } from 'solid-js';
import { getHost, type HostNode } from '@stingjs/core';

const renderer = createRenderer<HostNode>({
  createElement(type: string, staticProperties?: Record<string, unknown>) {
    const node = getHost().createElement(type);

    // Solid 2's universal renderer is evolving around construction-time static
    // properties. Keeping the optional second argument here contains that
    // upstream contract entirely inside @stingjs/solid.
    if (staticProperties) {
      for (const [name, value] of Object.entries(staticProperties)) {
        getHost().setProperty(node, name, value);
      }
    }

    return node;
  },
  createTextNode(value: string) {
    return getHost().createTextNode(value);
  },
  replaceText(node: HostNode, value: string) {
    getHost().replaceText(node, value);
  },
  setProperty(node: HostNode, name: string, value: unknown) {
    getHost().setProperty(node, name, value);
  },
  insertNode(parent: HostNode, node: HostNode, anchor?: HostNode | null) {
    getHost().insertNode(parent, node, anchor);
  },
  isTextNode(node: HostNode) {
    return getHost().isTextNode(node);
  },
  removeNode(parent: HostNode, node: HostNode) {
    getHost().removeNode(parent, node);
  },
  getParentNode(node: HostNode) {
    return getHost().getParentNode(node);
  },
  getFirstChild(node: HostNode) {
    return getHost().getFirstChild(node);
  },
  getNextSibling(node: HostNode) {
    return getHost().getNextSibling(node);
  },
});

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  applyRef,
  ref,
} = renderer;

/**
 * Bind one existing Sting host text node to a Solid computation.
 *
 * Native Text primitives intentionally own a single persistent host text node.
 * Every reactive change therefore maps directly to replaceText instead of
 * entering generic child reconciliation.
 */
export function bindHostText(node: HostNode, readValue: () => string): void {
  createRenderEffect(() => {
    getHost().replaceText(node, readValue());
  });
}

function requireHostNode(value: unknown): HostNode {
  if (
    value == null ||
    typeof value !== 'object' ||
    typeof (value as Partial<HostNode>).id !== 'number' ||
    typeof (value as Partial<HostNode>).type !== 'string' ||
    !Array.isArray((value as Partial<HostNode>).children)
  ) {
    throw new TypeError('A StingJS application must render a native host node at its root');
  }

  return value as HostNode;
}

export function renderApp(code: () => unknown): () => void {
  return render(() => requireHostNode(code()), getHost().root);
}

// Solid 2 control-flow names. These are intentionally forwarded from the
// current public runtime rather than preserving Solid 1 aliases.
export { Errored, For, Loading, Match, Repeat, Reveal, Show, Switch } from 'solid-js';
