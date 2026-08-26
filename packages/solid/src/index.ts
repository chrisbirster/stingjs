import { createRenderer } from '@solidjs/universal';
import {
  createMemo,
  createRenderEffect,
  flush,
  omit,
  untrack,
  type ComponentProps,
  type Element as SolidElement,
  type ValidComponent,
} from 'solid-js';
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

const { render: universalRender } = renderer;

export const {
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

export type StingDynamicComponent = ValidComponent | string;

type StingDynamicComponentProps<T extends StingDynamicComponent> =
  T extends ValidComponent ? ComponentProps<T> : Record<string, unknown>;

export type DynamicProps<
  T extends StingDynamicComponent,
  P = StingDynamicComponentProps<T>,
> = {
  [K in keyof P]: P[K];
} & {
  component: T | undefined;
};

type DynamicElement = SolidElement | HostNode;

/**
 * Universal/native counterpart to Solid 2's renderer-specific Dynamic helper.
 *
 * Solid keeps Dynamic in renderer packages because intrinsic element creation is
 * platform-specific. This mirrors the current Solid 2 control-flow behavior but
 * routes string intrinsics through Sting's @solidjs/universal renderer instead
 * of importing the DOM-oriented @solidjs/web implementation.
 */
export function createDynamic<T extends StingDynamicComponent>(
  component: () => T | undefined,
  props: StingDynamicComponentProps<T>,
): DynamicElement {
  const cached = createMemo<Function | string | undefined>(
    () => component() as Function | string | undefined,
  );

  return createMemo(() => {
    const selected = cached();
    switch (typeof selected) {
      case 'function':
        return untrack(() => selected(props));
      case 'string': {
        const element = createElement(selected);
        spread(element, props as object);
        return element;
      }
      default:
        return undefined;
    }
  }) as unknown as DynamicElement;
}

export function Dynamic<T extends StingDynamicComponent>(
  props: DynamicProps<T>,
): DynamicElement {
  const others = omit(props, 'component');
  return createDynamic(
    () => props.component,
    others as StingDynamicComponentProps<T>,
  );
}

/**
 * Bind one existing Sting host text node to a Solid computation.
 *
 * Solid 2 effects separate dependency tracking (compute) from the side effect
 * (apply). Native Text owns one persistent host text node, so every update maps
 * directly to replaceText instead of entering generic child reconciliation.
 */
export function bindHostText(node: HostNode, readValue: () => string): void {
  createRenderEffect(readValue, value => {
    getHost().replaceText(node, value);
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

/**
 * Render Solid JSX into an explicit Sting host root.
 *
 * Solid 2 types JSX expressions as `Element`, which is intentionally wider than
 * Sting's concrete HostNode. Keep that upstream type detail out of application
 * and conformance code, then validate the renderer invariant at the Sting
 * boundary before passing the value to @solidjs/universal.
 */
export function render(code: () => unknown, root: HostNode): () => void {
  const host = getHost();
  const baselineChildren = new Set(root.children);
  const disposeSolid = universalRender(() => requireHostNode(code()), root);
  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;

    try {
      // Tear down Solid ownership first so descendant reactive cleanups run
      // before their native subtree is detached.
      disposeSolid();
    } finally {
      // @solidjs/universal 2.0.0-rc.0 replaces the base renderer's render()
      // implementation to schedule the initial mount, but that wrapper returns
      // the reactive disposer without the base renderer's mounted-node cleanup.
      // Remove only direct children introduced by this render so repeated
      // renders cannot leave stale root nodes that corrupt later replacement
      // operations such as <Errored> swapping content for its fallback.
      for (const child of [...root.children]) {
        if (!baselineChildren.has(child) && child.parent === root) {
          host.removeNode(root, child);
        }
      }
    }
  };
}

export function renderApp(code: () => unknown): () => void {
  const host = getHost();
  const dispatchWithoutFlush = globalThis.__stingDispatchEvent;

  if (!dispatchWithoutFlush) {
    throw new Error('Sting native event dispatcher was not installed with the native bridge');
  }

  // Solid 2 batches signal writes. Browser renderers establish a flush boundary
  // around native events; Sting must do the equivalent for UIKit/Android events
  // so signal changes become native mutations before the event returns.
  globalThis.__stingDispatchEvent = (nodeId, event, payloadJSON) => {
    dispatchWithoutFlush(nodeId, event, payloadJSON);
    flush();
  };

  const dispose = render(code, host.root);
  return () => {
    globalThis.__stingDispatchEvent = dispatchWithoutFlush;
    dispose();
  };
}

// Solid 2 control-flow names. These are intentionally forwarded from the
// current public runtime rather than preserving Solid 1 aliases.
export { Errored, For, Loading, Match, Repeat, Reveal, Show, Switch } from 'solid-js';
