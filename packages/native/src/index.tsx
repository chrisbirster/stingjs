import { createElement, spread } from '@stingjs/solid';
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

/** Native container backed by UIView/UIStackView on iOS and View/ViewGroup on Android. */
export function View(props: ViewProps): HostNode {
  return createNativePrimitive('view', props);
}

/** Native text backed by UILabel on iOS and TextView on Android. */
export function Text(props: TextProps): HostNode {
  return createNativePrimitive('text', props);
}

/** Native pressable button backed by UIButton on iOS and Button on Android. */
export function Button(props: ButtonProps): HostNode {
  return createNativePrimitive('button', props);
}
