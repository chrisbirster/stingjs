import type { Style, SxInput } from '@stingjs/native';

export type StyleXDefinition = Readonly<Record<string, Style>>;
export type StyleXStyles<T extends Style = Style> =
  | T
  | readonly StyleXStyles<T>[]
  | false
  | null
  | undefined;

/**
 * StyleX-shaped authoring adapter for Sting.
 *
 * This mirrors StyleX's small `create` + `props` mental model while keeping
 * Sting's modifier IR as the native runtime target. It intentionally does not
 * depend on @stylexjs/stylex, so native builds never create or resolve CSS classes.
 */
export function create<const T extends StyleXDefinition>(styles: T): T {
  return styles;
}

/** Compose reusable definitions into the `sx` prop consumed by @stingjs/native. */
export function props(...styles: readonly SxInput[]): { readonly sx: readonly SxInput[] } {
  return { sx: styles };
}

/** Value-level composition helper when JSX spread syntax is undesirable. */
export function compose(...styles: readonly SxInput[]): readonly SxInput[] {
  return styles;
}
