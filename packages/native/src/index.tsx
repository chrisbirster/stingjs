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
export type AccessibilityRole = 'none' | 'text' | 'header' | 'button' | 'image' | 'link';
export type AppState = 'active' | 'inactive' | 'background';

export interface AccessibilityProps {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityValue?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHidden?: boolean;
  focusable?: boolean;
}

export interface ViewProps extends StyleProps, AccessibilityProps {
  children?: unknown;
}

export interface SafeAreaProps extends ViewProps {}
export interface KeyboardAvoidingViewProps extends ViewProps {}
export interface NavigationStackProps extends ViewProps {
  onBack?: () => void;
}

export interface GesturePointEvent {
  x: number;
  y: number;
  touches: number;
}

export interface PanGestureEvent extends GesturePointEvent {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
  cancelled: boolean;
}

export interface GestureViewProps extends ViewProps {
  onTap?: (event: GesturePointEvent) => void;
  onLongPress?: (event: GesturePointEvent) => void;
  onPanStart?: (event: PanGestureEvent) => void;
  onPan?: (event: PanGestureEvent) => void;
  onPanEnd?: (event: PanGestureEvent) => void;
}

export interface PresentationProps extends AccessibilityProps {
  children?: unknown;
  presented?: boolean;
  onDismiss?: () => void;
}

export interface VirtualListProps extends ViewProps {
  itemExtent: number;
  overscan?: number;
}

export interface FocusViewProps extends ViewProps {
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface AppRootProps extends ViewProps {
  onAppear?: () => void;
  onDisappear?: () => void;
  onAppStateChange?: (event: { state: AppState }) => void;
}

export interface TextProps extends StyleProps, AccessibilityProps {
  children?: unknown;
}

export interface HeadingProps extends TextProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export type ButtonVariant = 'native' | 'primary';

export interface ButtonProps extends StyleProps, AccessibilityProps {
  children?: unknown;
  disabled?: boolean;
  onPress?: () => void;
  variant?: ButtonVariant;
}

export interface ImageProps extends StyleProps, AccessibilityProps {
  source?: ImageSource;
  resizeMode?: ImageResizeMode;
}

export interface TextInputProps extends StyleProps, AccessibilityProps {
  value?: string;
  placeholder?: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
}

export interface ScrollViewProps extends StyleProps, AccessibilityProps {
  children?: unknown;
  horizontal?: boolean;
}

const accessibilityKeys = [
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityValue',
  'accessibilityRole',
  'accessibilityHidden',
  'focusable',
] as const;

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

function bindStyling(
  node: HostNode,
  readStyling: () => ReturnType<typeof resolveStyling>,
): void {
  let hasEmittedStyle = false;
  let hasEmittedNativeModifiers = false;

  createRenderEffect(readStyling, resolved => {
    if (hasResolvedStyle(resolved)) hasEmittedStyle = true;
    if (hasEmittedStyle) getHost().setProperty(node, 'style', resolved.style);

    if (resolved.nativeModifiers.length > 0) hasEmittedNativeModifiers = true;
    if (hasEmittedNativeModifiers) getHost().setProperty(node, 'nativeModifiers', resolved.nativeModifiers);
  });
}

function createHostPrimitive(
  type: string,
  props: Record<string, unknown>,
  forwardedKeys: readonly string[],
): HostNode {
  const node = createElement(type);
  const forwarded: Record<string, unknown> = {};
  for (const key of forwardedKeys) {
    defineForwardedGetter(forwarded, key, () => props[key]);
  }
  spread(node, forwarded);
  return node;
}

function createNativePrimitive(
  type: string,
  props: StyleProps & Record<string, unknown>,
  forwardedKeys: readonly string[],
  defaults?: ModifierInput,
  variant?: () => ModifierInput,
): HostNode {
  const node = createHostPrimitive(type, props, forwardedKeys);
  const readStyling = () => resolveStyling({
    defaults,
    variant: variant?.(),
    style: props.style,
    sx: props.sx,
    props,
    modifiers: props.modifiers,
  });
  bindStyling(node, readStyling);
  return node;
}

function stringifyTextChild(value: unknown): string {
  if (typeof value === 'function') return stringifyTextChild((value as () => unknown)());
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

export function View(props: ViewProps): HostNode {
  return createNativePrimitive('view', props as ViewProps & Record<string, unknown>, ['children', ...accessibilityKeys]);
}

export function Box(props: ViewProps): HostNode {
  return View(props);
}

export function SafeArea(props: SafeAreaProps): HostNode {
  return createNativePrimitive(
    'safearea',
    props as SafeAreaProps & Record<string, unknown>,
    ['children', ...accessibilityKeys],
    flexDirection('column'),
  );
}

export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps): HostNode {
  return createNativePrimitive(
    'keyboardavoidingview',
    props as KeyboardAvoidingViewProps & Record<string, unknown>,
    ['children', ...accessibilityKeys],
    flexDirection('column'),
  );
}

export function NavigationStack(props: NavigationStackProps): HostNode {
  return createNativePrimitive(
    'navigationstack',
    props as NavigationStackProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'onBack'],
  );
}

export function GestureView(props: GestureViewProps): HostNode {
  return createNativePrimitive(
    'gestureview',
    props as GestureViewProps & Record<string, unknown>,
    [
      'children',
      ...accessibilityKeys,
      'onTap',
      'onLongPress',
      'onPanStart',
      'onPan',
      'onPanEnd',
    ],
    flexDirection('column'),
  );
}

/** UIKit/Android native modal presentation controlled by the `presented` prop. */
export function Modal(props: PresentationProps): HostNode {
  return createHostPrimitive(
    'modal',
    props as PresentationProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'presented', 'onDismiss'],
  );
}

/** UIKit page sheet / Android bottom sheet-style Dialog presentation. */
export function Sheet(props: PresentationProps): HostNode {
  return createHostPrimitive(
    'sheet',
    props as PresentationProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'presented', 'onDismiss'],
  );
}

/**
 * Fixed-extent native-windowed list. Solid owns item identity; native only keeps
 * the visible window plus overscan attached for layout and drawing.
 */
export function VirtualList(props: VirtualListProps): HostNode {
  return createNativePrimitive(
    'virtuallist',
    props as VirtualListProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'itemExtent', 'overscan'],
  );
}

/** Explicit cross-platform focus target. */
export function FocusView(props: FocusViewProps): HostNode {
  return createNativePrimitive(
    'focusview',
    props as FocusViewProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'autoFocus', 'onFocus', 'onBlur'],
    flexDirection('column'),
  );
}

/**
 * Full-bleed application root. Safe-area and keyboard avoidance remain explicit
 * child primitives so system insets are never silently applied twice.
 */
export function AppRoot(props: AppRootProps): HostNode {
  return createNativePrimitive(
    'approot',
    props as AppRootProps & Record<string, unknown>,
    ['children', ...accessibilityKeys, 'onAppear', 'onDisappear', 'onAppStateChange'],
    flexDirection('column'),
  );
}

export function Stack(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', ...accessibilityKeys],
    flexDirection('column'),
  );
}

export function HStack(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', ...accessibilityKeys],
    flexDirection('row'),
  );
}

export function Center(props: ViewProps): HostNode {
  return createNativePrimitive(
    'view',
    props as ViewProps & Record<string, unknown>,
    ['children', ...accessibilityKeys],
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
  for (const key of accessibilityKeys) {
    defineForwardedGetter(forwarded, key, () => props[key]);
  }

  spread(node, forwarded, true);
  bindStyling(node, readStyling);
  insertNode(node, textNode);
  bindHostText(textNode, () => stringifyTextChild(props.children));
  return node;
}

export function Text(props: TextProps): HostNode {
  return createNativeText(props);
}

export function Heading(props: HeadingProps): HostNode {
  return createNativeText(props, headingDefaults[props.level ?? 1]);
}

export function Button(props: ButtonProps): HostNode {
  const variant = () => {
    const selected = props.variant ?? 'native';
    return selected === 'native' ? undefined : buttonRecipe({ variant: selected });
  };

  return createNativePrimitive(
    'button',
    props as ButtonProps & Record<string, unknown>,
    ['children', 'disabled', ...accessibilityKeys, 'onPress'],
    undefined,
    variant,
  );
}

export function Image(props: ImageProps): HostNode {
  return createNativePrimitive(
    'image',
    props as ImageProps & Record<string, unknown>,
    ['source', 'resizeMode', ...accessibilityKeys],
  );
}

export function TextInput(props: TextInputProps): HostNode {
  return createNativePrimitive(
    'textinput',
    props as TextInputProps & Record<string, unknown>,
    ['value', 'placeholder', 'editable', ...accessibilityKeys, 'onChangeText'],
  );
}

export function ScrollView(props: ScrollViewProps): HostNode {
  return createNativePrimitive(
    'scrollview',
    props as ScrollViewProps & Record<string, unknown>,
    ['children', 'horizontal', ...accessibilityKeys],
  );
}
