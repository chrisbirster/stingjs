import { createRenderer } from '@solidjs/universal';
import { getHost, type HostNode } from '@stingjs/core';

const renderer = createRenderer<HostNode>({
  createElement(type: string, staticProperties?: Record<string, unknown>) {
    const node = getHost().createElement(type);

    // Solid 2's universal renderer is still evolving around construction-time
    // static properties. Supporting them here keeps that upstream detail inside
    // this adapter instead of leaking it into @stingjs/core or applications.
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
  use,
} = renderer;

export function renderApp(code: () => unknown): () => void {
  return render(code, getHost().root);
}

export {
  ErrorBoundary,
  For,
  Index,
  Match,
  Show,
  Suspense,
  SuspenseList,
  Switch,
} from 'solid-js';
