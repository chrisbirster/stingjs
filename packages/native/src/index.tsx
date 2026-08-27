import {
  bindHostText,
  createElement,
  createTextNode,
  insertNode,
  spread,
} from '@stingjs/solid';
import type { HostNode } from '@stingjs/core';

export type FlexDirection = 'row' | 'column';
export type ImageResizeMode = 'contain' | 'cover' | 'stretch';
export type ImageSource = string | { uri: string };

/**
 * Deliberately small v0.1 layout/style surface. Values are device-independent
 * points on iOS and density-independent pixels on Android unless noted.
 */
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

export interface ImageProps {
  source?: ImageSource;
  resizeMode?: ImageResizeMode;
  style?: Style;
  accessibilityLabel?: string;
}

export interface TextInputProps {
  value?: string;
  placeholder?: string;
  editable?: boolean;
  style?: Style;
  accessibilityLabel?: string;
  onChangeText?: (value: string) => void;
}

export interface ScrollViewProps {
  children?: unknown;
  horizontal?: boolean;
  style?: Style;
  accessibilityLabel?: string;
}

function createNativePrimitive(type: string, props: object): HostNode {
  const node = createElement(type);
  spread(node, props);
  return node;
}

function stringifyTextChild(value: unknown): string {
  // Solid's universal JSX transform may preserve dynamic children as accessors.
  // Text calls this function from bindHostText's createRenderEffect, so invoking
  // the accessor here both resolves its current value and subscribes the effect
  // to every signal read by that accessor.
  if (typeof value === 'function') {
    return stringifyTextChild((value as () => unknown)());
  }

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

/** Native container backed by UIStackView on iOS and LinearLayout on Android. */
export function View(props: ViewProps): HostNode {
  return createNativePrimitive('view', props);
}

/**
 * Native text backed by UILabel on iOS and TextView on Android.
 *
 * A Text owns exactly one persistent host text node. Solid tracks the
 * component's children inside bindHostText and every subsequent signal change
 * mutates that node through replaceText. This keeps text updates on Sting's
 * fine-grained hot path and completely avoids child reconciliation.
 */
export function Text(props: TextProps): HostNode {
  const node = createElement('text');
  const textNode = createTextNode('');

  // Text content is owned by the explicit binding below; generic spread still
  // handles styles and accessibility properties but never reconciles children.
  spread(node, props, true);
  insertNode(node, textNode);
  bindHostText(textNode, () => stringifyTextChild(props.children));

  return node;
}

/** Native pressable button backed by UIButton on iOS and Button on Android. */
export function Button(props: ButtonProps): HostNode {
  return createNativePrimitive('button', props);
}

/** Native image backed by UIImageView on iOS and ImageView on Android. */
export function Image(props: ImageProps): HostNode {
  return createNativePrimitive('image', props);
}

/**
 * Controlled native text input. `onChangeText` receives the current native text
 * as a string; assigning `value` from Solid updates the native control without
 * synthesizing another change event.
 */
export function TextInput(props: TextInputProps): HostNode {
  return createNativePrimitive('textinput', props);
}

/**
 * Native scrolling container. Children retain ordinary Sting host identities;
 * the platform host owns only the scroll container/content-view plumbing.
 */
export function ScrollView(props: ScrollViewProps): HostNode {
  return createNativePrimitive('scrollview', props);
}
