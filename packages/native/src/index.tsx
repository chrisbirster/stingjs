import {
  createElement,
  createTextNode,
  effect,
  insertNode,
  replaceHostText,
  spread,
} from '@stingjs/solid';
import type { HostNode } from '@stingjs/core';

export type FlexDirection = 'row' | 'column';

export interface Style {
  flexDirection?: FlexDirection;
  gap?: number;
  padding?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
}

export interface ViewProps {
  children?: unknown;
  style?: Style;
  accessibilityLabel?: string;
}

export interface TextProps {
  children?: unknown;
  style?: Style;
  accessibilityLabel?: string;
}

export interface ButtonProps {
  children?: unknown;
  style?: Style;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}

function createNativePrimitive(type: string, props: object): HostNode {
  const node = createElement(type);
  spread(node, props);
  return node;
}

function stringifyTextChild(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(stringifyTextChild).join('');

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
      return String(value);
    default:
      throw new TypeError('@stingjs/native <Text> only accepts textual children');
  }
}

/** Native container backed by UIView/UIStackView on iOS and View/ViewGroup on Android. */
export function View(props: ViewProps): HostNode {
  return createNativePrimitive('view', props);
}

/**
 * Native text backed by UILabel on iOS and TextView on Android.
 *
 * A Text primitive owns exactly one host text node. Reading props.children
 * inside this Solid effect subscribes directly to the signals that produced
 * the text, so a fine-grained update maps to one replaceText bridge command
 * instead of reconciling a mixed array such as ["Count: ", count()].
 */
export function Text(props: TextProps): HostNode {
  const node = createElement('text');

  // Keep element-level properties on the native UILabel/TextView while
  // deliberately excluding children from the universal spread reconciler.
  spread(node, {
    get style() {
      return props.style;
    },
    get accessibilityLabel() {
      return props.accessibilityLabel;
    },
  });

  const textNode = createTextNode('');
  insertNode(node, textNode);

  effect(() => {
    replaceHostText(textNode, stringifyTextChild(props.children));
  });

  return node;
}

/** Native pressable button backed by UIButton on iOS and Button on Android. */
export function Button(props: ButtonProps): HostNode {
  return createNativePrimitive('button', props);
}
