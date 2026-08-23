import { splitProps } from 'solid-js';

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

export function View(props: ViewProps) {
  const [local, rest] = splitProps(props, ['children']);
  return <view {...rest}>{local.children}</view>;
}

export function Text(props: TextProps) {
  const [local, rest] = splitProps(props, ['children']);
  return <text {...rest}>{local.children}</text>;
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['children']);
  return <button {...rest}>{local.children}</button>;
}
