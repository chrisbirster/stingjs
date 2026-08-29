import { createRenderEffect } from 'solid-js';
import {
  bindHostText,
  createElement,
  createTextNode,
  insertNode,
  spread,
} from '@stingjs/solid';
import { getHost, type HostNode } from '@stingjs/core';
import {
  alignItems,
  background,
  flexDirection,
  fontSize,
  fontWeight,
  foreground,
  justifyContent,
  paddingX,
  paddingY,
  recipe,
  resolveStyling,
  rounded,
  type ModifierInput,
  type StyleProps,
} from './style';

export * from './style';

export type ImageResizeMode = 'contain' | 'cover' | 'stretch';
export type ImageSource = string | { uri: string };

export interface ViewProps extends StyleProps {
  children?: unknown;
  accessibilityLabel?: string;
}

export interface SafeAreaProps extends ViewProps {}
export interface KeyboardAvoidingViewProps extends ViewProps {}

export interface TextProps extends StyleProps {
  children?: unknown;
  accessibilityLabel?: string;
}

export interface HeadingProps extends TextProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export type ButtonVariant = 'native' | 'primary';

export interface ButtonProps extends StyleProps {
  children?: unknown;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
}

export interface ImageProps extends StyleProps {
  source?: ImageSource;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
}

export interface TextInputProps extends StyleProps {
  value?: string;
  placeholder?: string;
  editable?: boolean;
  accessibilityLabel?: string;
  onChangeText?: (value: string) => void;
}

export interface ScrollViewProps extends StyleProps {
  children?: unknown;
  horizontal?: boolean;
  accessibilityLabel?: string;
}

// Recipes are a design-system layer over the modifier IR. Sting ships one
// deliberately small example so the framework does not become a theme library.
const buttonRecipe = recipe({
  variants: {
    variant: {
      primary: [
        background('accent'),
        foreground('onAccent'),
        rounded('md'),
        fontWeight('semibold'),
        paddingX('4'),
        paddingY(10),
      ],
    },
  },
});

const headingDefaults: Readonly<Record<NonNullable<HeadingProps['level']>, ModifierInput>> = {
  1: [fontSize(32), fontWeight('bold')],
  2: [fontSize(28), fontWeight('bold')],
  3: [fontSize(24), fontWeight('semibold')],
  4: [fontSize(20), fontWeight('semibold')],
  5: [fontSize(18), fontWeight('semibold')],
  6: [fontSize(16), fontWeight('semibold')],
};

function defineForwardedGetter(
  target: Record<string, unknown>,
  key: string,
  read: () => unknown,
): void {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: false,
    get: read,
  });
}

function hasResolvedStyle(styling: ReturnType<typeof resolveStyling>): boolean {
  return Object.entries(styling.style).some(([key, value]) => key !== '__stingResolved' && value !== null);
}

/**
 * Bind the two styling bridge channels directly to Solid's reactive graph.
 *
 * Completely unstyled nodes stay mutation-free. Once a channel has emitted,
 * resolved nulls/empty arrays continue to flow so native state can be reset
 * when a reactive style or native modifier disappears.
 */
function bindStyling(
  node: HostNode,
  readStyling: () => ReturnType<typeof resolveStyling>,
): void {
  let hasEmittedStyle = false;
  let hasEmittedNativeModifiers = false;

  createRenderEffect(readStyling, resolved => {
    if (hasResolvedStyle(resolved)) hasEmittedStyle = true;
    if (hasEmittedStyle) {
      getHost().setProperty(node, 'style', resolved.style);
    }

    if (resolved.nativeModifiers.length > 0) hasEmittedNativeModifiers = true;
    if (hasEmittedNativeModifiers) {
      getHost().setProperty(node, 'nativeModifiers', resolved.nativeModifiers);
    }
  });
}

function createNativePrimitive(
  type: string,
  props: StyleProps & Record<string, unknown>,
  forwardedKeys: readonly string[],
  defaults?: ModifierInput,
  variant?: () => ModifierInput,
): HostNode {
  const node = createElement(type);
  const readStyling = () => resolveStyling({
    defaults,
    variant: variant?.(),
    style: props.style,
    sx: props.sx,
    props,
    modifiers: props.modifiers,
  });

  const forwarded: Record<string, unknown> = {};
  for (const key of forwardedKeys) {
    defineForwardedGetter(forwarded, key, () => props[key]);
  }
  spread(node, forwarded);
  bindStyling(node, readStyling);
  return node;
}

function stringifyTextChild(value: unknown): string {
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
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
  );
}

/** Semantic neutral container. Box resolves to the same native View host. */
export function Box(props: ViewProps): HostNode {
  return View(props);
}

/**
 * Native safe-area container. Authored padding remains additive with the current
 * iOS safe area / Android system-bar and display-cutout insets.
 */
export function SafeArea(props: SafeAreaProps): HostNode {
  return createNativePrimitive(
    'safearea',
    props as SafeAreaProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
    flexDirection('column'),
  );
}

/**
 * Native keyboard-avoiding container. Authored bottom padding remains additive
 * with the current iOS keyboard / Android IME overlap.
 */
export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps): HostNode {
  return createNativePrimitive(
    'keyboardavoidingview',
    props as KeyboardAvoidingViewProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
    flexDirection('column'),
  );
}

/** Vertical semantic layout primitive. */
export function Stack(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
    flexDirection('column'),
  );
}

/** Horizontal semantic layout primitive. */
export function HStack(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
    flexDirection('row'),
  );
}

/** Centers its native children on both axes. */
export function Center(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', 'accessibilityLabel'],
    [flexDirection('column'), alignItems('center'), justifyContent('center')],
  );
}

function createNativeText(props: TextProps, defaults?: ModifierInput): HostNode {
  const node = createElement('text');
  const textNode = createTextNode('');
  const readStyling = () => resolveStyling({
    defaults,
    style: props.style,
    sx: props.sx,
    props,
    modifiers: props.modifiers,
  });
  const forwarded: Record<string, unknown> = {};
  defineForwardedGetter(forwarded, 'accessibilityLabel', () => props.accessibilityLabel);

  spread(node, forwarded, true);
  bindStyling(node, readStyling);
  insertNode(node, textNode);
  bindHostText(textNode, () => stringifyTextChild(props.children));
  return node;
}

/**
 * Native text backed by UILabel on iOS and TextView on Android.
 * A Text owns exactly one persistent host text node, preserving fine-grained updates.
 */
export function Text(props: TextProps): HostNode {
  return createNativeText(props);
}

/** Semantic heading. On native it remains a Text host with heading typography defaults. */
export function Heading(props: HeadingProps): HostNode {
  return createNativeText(props, headingDefaults[props.level ?? 1]);
}

/** Native pressable button. `primary` demonstrates the recipe/variant layer. */
export function Button(props: ButtonProps): HostNode {
  const variant = () => {
    const selected = props.variant ?? 'native';
    return selected === 'native' ? undefined : buttonRecipe({ variant: selected });
  };

  return createNativePrimitive(
    'button',
    props as ButtonProps & Record<string, unknown>,
    ['children', 'disabled', 'accessibilityLabel', 'onPress'],
    undefined,
    variant,
  );
}

/** Native image backed by UIImageView on iOS and ImageView on Android. */
export function Image(props: ImageProps): HostNode {
  return createNativePrimitive(
    'image',
    props as ImageProps & Record<string, unknown>,
    ['source', 'resizeMode', 'accessibilityLabel'],
  );
}

/** Controlled native text input. */
export function TextInput(props: TextInputProps): HostNode {
  return createNativePrimitive(
    'textinput',
    props as TextInputProps & Record<string, unknown>,
    ['value', 'placeholder', 'editable', 'accessibilityLabel', 'onChangeText'],
  );
}

/** Native scrolling container. */
export function ScrollView(props: ScrollViewProps): HostNode {
  return createNativePrimitive(
    'scrollview',
    props as ScrollViewProps & Record<string, unknown>,
    ['children', 'horizontal', 'accessibilityLabel'],
  );
}
