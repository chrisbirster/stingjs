import { createElement, insert, spread } from '@stingjs/solid';
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
 * Text deliberately collapses its children to one scalar accessor. Solid's
 * universal insert primitive therefore creates one stable host text node and
 * uses replaceText for subsequent reactive changes instead of reconciling a
 * mixed child array such as ["Count: ", count()].
 */
export function Text(props: TextProps): HostNode {
  const node = createElement('text');

  // `skipChildren` keeps the generic spread reconciler away from Text's
  // content while still applying style/accessibility properties reactively.
  spread(node, props, true);
  insert(node, () => stringifyTextChild(props.children));

  return node;
}

/** Native pressable button backed by UIButton on iOS and Button on Android. */
export function Button(props: ButtonProps): HostNode {
  return createNativePrimitive('button', props);
}
