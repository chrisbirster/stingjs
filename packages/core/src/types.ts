export const STING_PROTOCOL_VERSION = 1 as const;

export type StingPlatform = 'ios' | 'android';

export type NativeValue =
  | null
  | boolean
  | number
  | string
  | NativeValue[]
  | { [key: string]: NativeValue };

export interface StingRuntimeInfo {
  protocolVersion: typeof STING_PROTOCOL_VERSION;
  platform: StingPlatform;
  modules: Record<string, string>;
}

export interface StingNativeErrorData {
  code: string;
  message: string;
  module: string;
  method: string;
  details?: NativeValue;
}

export type NativeCallResponse =
  | { ok: true; value?: NativeValue }
  | { ok: false; error: StingNativeErrorData };
