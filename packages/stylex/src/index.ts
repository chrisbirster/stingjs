import type { Style, SxInput } from '@stingjs/native';

export type StyleXDefinition = Readonly<Record<string, Style>>;
export type StyleXStyles<T extends Style = Style> =
  | T
  | readonly StyleXStyles<T>[]
  | false
  | null
  | undefined;

/**
 * Native half of Sting's StyleX integration.
 *
 * Application code uses StyleX's `create` + composition model. On Sting native
 * builds these static definitions remain typed style values that feed `sx` and
 * lower into the Sting Style IR. A web build can configure the official StyleX
 * compiler to recognize this package as an import source and emit atomic CSS.
 * CSS classes are never interpreted by the native runtime.
 */
export function create<const T extends StyleXDefinition>(styles: T): T {
  return styles;
}

/** Compose StyleX definitions into the `sx` prop consumed by @stingjs/native. */
export function props(...styles: readonly SxInput[]): { readonly sx: readonly SxInput[] } {
  return { sx: styles };
}
