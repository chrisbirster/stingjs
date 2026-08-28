export type FlexDirection = 'row' | 'column';
export type AlignItems = 'stretch' | 'start' | 'center' | 'end';
export type JustifyContent = 'start' | 'center';
export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 400 | 500 | 600 | 700;

export interface Style {
  flexDirection?: FlexDirection;
  alignItems?: AlignItems;
  justifyContent?: JustifyContent;
  gap?: number;
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  width?: number;
  height?: number;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  borderRadius?: number;
  opacity?: number;
}

export const tokens = {
  space: {
    '0': 0,
    '1': 4,
    '2': 8,
    '3': 12,
    '4': 16,
    '5': 20,
    '6': 24,
    '8': 32,
    '10': 40,
    '12': 48,
    '16': 64,
  },
  radii: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  colors: {
    transparent: '#00000000',
    surface: '#ffffff',
    surfaceMuted: '#f4f4f5',
    text: '#18181b',
    muted: '#71717a',
    accent: '#4f46e5',
    onAccent: '#ffffff',
    danger: '#dc2626',
    onDanger: '#ffffff',
  },
  fonts: {
    body: { size: 16, weight: 'regular' as const },
    title: { size: 28, weight: 'bold' as const },
    heading: { size: 24, weight: 'semibold' as const },
    caption: { size: 13, weight: 'medium' as const },
  },
} as const;

export type SpaceToken = keyof typeof tokens.space;
export type RadiusToken = keyof typeof tokens.radii;
export type ColorToken = keyof typeof tokens.colors;
export type FontToken = keyof typeof tokens.fonts;
export type SpaceValue = SpaceToken | number;
export type RadiusValue = RadiusToken | number;
export type ColorValue = ColorToken | string;

export type StyleProperty = keyof Style;

export interface StyleModifier<K extends StyleProperty = StyleProperty> {
  readonly $$stingModifier: true;
  readonly kind: 'style';
  readonly property: K;
  readonly value: NonNullable<Style[K]>;
}

export interface NativeModifierDescriptor {
  readonly name: string;
  readonly value?: unknown;
}

export interface NativeModifier {
  readonly $$stingModifier: true;
  readonly kind: 'native';
  readonly descriptor: NativeModifierDescriptor;
}

export type Modifier = StyleModifier | NativeModifier;
export type ModifierInput =
  | Modifier
  | false
  | null
  | undefined
  | (() => ModifierInput)
  | readonly ModifierInput[];

export type SxInput =
  | Style
  | false
  | null
  | undefined
  | (() => SxInput)
  | readonly SxInput[];

export interface StyleProps {
  /** Compatibility escape hatch. Prefer sx, semantic props, or modifiers for new code. */
  style?: SxInput;
  /** Reusable/compiled style input. @stingjs/stylex returns values accepted here. */
  sx?: SxInput;
  /** Ordered native-first styling. Explicit modifiers have highest precedence. */
  modifiers?: ModifierInput;
  p?: SpaceValue;
  px?: SpaceValue;
  py?: SpaceValue;
  pt?: SpaceValue;
  pr?: SpaceValue;
  pb?: SpaceValue;
  pl?: SpaceValue;
  gap?: SpaceValue;
  bg?: ColorValue;
  rounded?: RadiusValue;
  opacity?: number;
  w?: number;
  h?: number;
  direction?: FlexDirection;
  align?: AlignItems;
  justify?: JustifyContent;
}

const CANONICAL_STYLE_KEYS = [
  'flexDirection',
  'alignItems',
  'justifyContent',
  'gap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'width',
  'height',
  'backgroundColor',
  'color',
  'fontSize',
  'fontWeight',
  'borderRadius',
  'opacity',
] as const;

type CanonicalStyleKey = (typeof CANONICAL_STYLE_KEYS)[number];

export type ResolvedStyle = {
  readonly __stingResolved: true;
} & Record<CanonicalStyleKey, Style[CanonicalStyleKey] | null>;

export interface ResolvedStyling {
  readonly style: ResolvedStyle;
  readonly nativeModifiers: readonly NativeModifierDescriptor[];
}

function makeStyleModifier<K extends StyleProperty>(
  property: K,
  value: NonNullable<Style[K]>,
): StyleModifier<K> {
  return { $$stingModifier: true, kind: 'style', property, value };
}

function resolveSpace(value: SpaceValue): number {
  if (typeof value === 'number') return value;
  return tokens.space[value];
}

function resolveRadius(value: RadiusValue): number {
  if (typeof value === 'number') return value;
  return tokens.radii[value];
}

function resolveColor(value: ColorValue): string {
  return Object.prototype.hasOwnProperty.call(tokens.colors, value)
    ? tokens.colors[value as ColorToken]
    : value;
}

export const flexDirection = (value: FlexDirection) => makeStyleModifier('flexDirection', value);
export const alignItems = (value: AlignItems) => makeStyleModifier('alignItems', value);
export const justifyContent = (value: JustifyContent) => makeStyleModifier('justifyContent', value);
export const gap = (value: SpaceValue) => makeStyleModifier('gap', resolveSpace(value));
export const padding = (value: SpaceValue) => makeStyleModifier('padding', resolveSpace(value));
export const paddingX = (value: SpaceValue): ModifierInput => [
  makeStyleModifier('paddingLeft', resolveSpace(value)),
  makeStyleModifier('paddingRight', resolveSpace(value)),
];
export const paddingY = (value: SpaceValue): ModifierInput => [
  makeStyleModifier('paddingTop', resolveSpace(value)),
  makeStyleModifier('paddingBottom', resolveSpace(value)),
];
export const paddingTop = (value: SpaceValue) => makeStyleModifier('paddingTop', resolveSpace(value));
export const paddingRight = (value: SpaceValue) => makeStyleModifier('paddingRight', resolveSpace(value));
export const paddingBottom = (value: SpaceValue) => makeStyleModifier('paddingBottom', resolveSpace(value));
export const paddingLeft = (value: SpaceValue) => makeStyleModifier('paddingLeft', resolveSpace(value));
export const width = (value: number) => makeStyleModifier('width', value);
export const height = (value: number) => makeStyleModifier('height', value);
export const background = (value: ColorValue) => makeStyleModifier('backgroundColor', resolveColor(value));
export const foreground = (value: ColorValue) => makeStyleModifier('color', resolveColor(value));
export const fontSize = (value: number) => makeStyleModifier('fontSize', value);
export const fontWeight = (value: FontWeight) => makeStyleModifier('fontWeight', value);
export const rounded = (value: RadiusValue) => makeStyleModifier('borderRadius', resolveRadius(value));
export const cornerRadius = rounded;
export const opacity = (value: number) => makeStyleModifier('opacity', value);

/** Semantic typography modifier composed from the shared Sting font tokens. */
export function font(value: FontToken): ModifierInput {
  const token = tokens.fonts[value];
  return [fontSize(token.size), fontWeight(token.weight)];
}

export function nativeModifier(name: string, value?: unknown): NativeModifier {
  return {
    $$stingModifier: true,
    kind: 'native',
    descriptor: value === undefined ? { name } : { name, value },
  };
}

/** Native blur escape hatch. iOS uses UIVisualEffectView; Android uses RenderEffect on API 31+. */
export function nativeBlur(radius = 16): NativeModifier {
  return nativeModifier('blur', { radius });
}

/** Compose modifiers without introducing another runtime object model. */
export function m(...inputs: readonly ModifierInput[]): readonly ModifierInput[] {
  return inputs;
}

function emptyResolvedStyle(): Record<CanonicalStyleKey, Style[CanonicalStyleKey] | null> {
  return Object.fromEntries(CANONICAL_STYLE_KEYS.map(key => [key, null])) as Record<
    CanonicalStyleKey,
    Style[CanonicalStyleKey] | null
  >;
}

function applyStyleObject(
  target: Record<CanonicalStyleKey, Style[CanonicalStyleKey] | null>,
  style: Style,
): void {
  if (style.padding !== undefined) {
    target.paddingTop = style.padding;
    target.paddingRight = style.padding;
    target.paddingBottom = style.padding;
    target.paddingLeft = style.padding;
  }
  if (style.paddingHorizontal !== undefined) {
    target.paddingLeft = style.paddingHorizontal;
    target.paddingRight = style.paddingHorizontal;
  }
  if (style.paddingVertical !== undefined) {
    target.paddingTop = style.paddingVertical;
    target.paddingBottom = style.paddingVertical;
  }

  for (const key of CANONICAL_STYLE_KEYS) {
    const value = style[key];
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function visitSx(input: SxInput, apply: (style: Style) => void): void {
  if (!input) return;
  if (typeof input === 'function') {
    visitSx(input(), apply);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) visitSx(item, apply);
    return;
  }
  apply(input as Style);
}

function visitModifiers(input: ModifierInput, apply: (modifier: Modifier) => void): void {
  if (!input) return;
  if (typeof input === 'function') {
    visitModifiers(input(), apply);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) visitModifiers(item, apply);
    return;
  }
  apply(input as Modifier);
}

function applyModifier(
  target: Record<CanonicalStyleKey, Style[CanonicalStyleKey] | null>,
  modifier: StyleModifier,
): void {
  const property = modifier.property;
  const value = modifier.value;
  switch (property) {
    case 'padding':
      target.paddingTop = value as number;
      target.paddingRight = value as number;
      target.paddingBottom = value as number;
      target.paddingLeft = value as number;
      break;
    case 'paddingHorizontal':
      target.paddingLeft = value as number;
      target.paddingRight = value as number;
      break;
    case 'paddingVertical':
      target.paddingTop = value as number;
      target.paddingBottom = value as number;
      break;
    default:
      (target as Record<string, unknown>)[property] = value;
      break;
  }
}

export function stylePropsToModifiers(props: StyleProps): readonly ModifierInput[] {
  const result: ModifierInput[] = [];
  if (props.p !== undefined) result.push(padding(props.p));
  if (props.px !== undefined) result.push(paddingX(props.px));
  if (props.py !== undefined) result.push(paddingY(props.py));
  if (props.pt !== undefined) result.push(paddingTop(props.pt));
  if (props.pr !== undefined) result.push(paddingRight(props.pr));
  if (props.pb !== undefined) result.push(paddingBottom(props.pb));
  if (props.pl !== undefined) result.push(paddingLeft(props.pl));
  if (props.gap !== undefined) result.push(gap(props.gap));
  if (props.bg !== undefined) result.push(background(props.bg));
  if (props.rounded !== undefined) result.push(rounded(props.rounded));
  if (props.opacity !== undefined) result.push(opacity(props.opacity));
  if (props.w !== undefined) result.push(width(props.w));
  if (props.h !== undefined) result.push(height(props.h));
  if (props.direction !== undefined) result.push(flexDirection(props.direction));
  if (props.align !== undefined) result.push(alignItems(props.align));
  if (props.justify !== undefined) result.push(justifyContent(props.justify));
  return result;
}

export interface ResolveStylingOptions {
  readonly defaults?: ModifierInput;
  readonly variant?: ModifierInput;
  readonly style?: SxInput;
  readonly sx?: SxInput;
  readonly props?: StyleProps;
  readonly modifiers?: ModifierInput;
}

/**
 * Canonical precedence:
 * component defaults < variant < legacy style < sx < convenience props < modifiers.
 */
export function resolveStyling(options: ResolveStylingOptions): ResolvedStyling {
  const style = emptyResolvedStyle();
  const native = new Map<string, NativeModifierDescriptor>();

  const applyInput = (input: ModifierInput): void => {
    visitModifiers(input, modifier => {
      if (modifier.kind === 'style') {
        applyModifier(style, modifier);
      } else {
        native.set(modifier.descriptor.name, modifier.descriptor);
      }
    });
  };

  applyInput(options.defaults);
  applyInput(options.variant);
  visitSx(options.style, value => applyStyleObject(style, value));
  visitSx(options.sx, value => applyStyleObject(style, value));
  if (options.props) applyInput(stylePropsToModifiers(options.props));
  applyInput(options.modifiers);

  return {
    style: { __stingResolved: true, ...style },
    nativeModifiers: [...native.values()],
  };
}

export interface RecipeDefinition {
  readonly base?: ModifierInput;
  readonly variants?: Readonly<Record<string, Readonly<Record<string, ModifierInput>>>>;
  readonly defaultVariants?: Readonly<Record<string, string>>;
}

export type RecipeSelection = Readonly<Record<string, string | undefined>>;

/** Design-system layer: resolve named variants into ordinary modifiers. */
export function recipe(definition: RecipeDefinition) {
  return (selection: RecipeSelection = {}): readonly ModifierInput[] => {
    const result: ModifierInput[] = [definition.base];
    for (const [variantName, choices] of Object.entries(definition.variants ?? {})) {
      const selected = selection[variantName] ?? definition.defaultVariants?.[variantName];
      if (selected !== undefined) result.push(choices[selected]);
    }
    return result;
  };
}
