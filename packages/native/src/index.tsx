import { children } from 'solid-js';
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
 * Solid's `children` helper resolves nested JSX child accessors while keeping
 * their signal dependencies tracked. Sting then collapses that resolved value
 * into one scalar insertion so updates reuse a single host text node and emit
 * replaceText rather than structural child reconciliation.
 */
export function Text(props: TextProps): HostNode {
  const node = createElement('text');

  // `skipChildren` keeps the generic spread reconciler away from Text's
  // content while still applying style/accessibility properties reactively.
  spread(node, props, true);

  const resolvedChildren = children(() => props.children);
  insert(node, () => stringifyTextChild(resolvedChildren()));

  return node;
}

/** Native pressable button backed by UIButton on iOS and Button on Android. */
export function Button(props: ButtonProps): HostNode {
  return createNativePrimitive('button', props);
}
