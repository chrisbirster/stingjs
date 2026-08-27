import { getHost, type NativeValue } from '@stingjs/core';

export interface NativeModuleDescriptor<Name extends string = string> {
  readonly name: Name;
}

export interface NativeModuleClient<Name extends string = string> {
  readonly name: Name;
  isAvailable(): boolean;
  version(): string | undefined;
  callSync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args?: readonly NativeValue[],
  ): Result;
}

export function createNativeModule<const Name extends string>(
  descriptor: NativeModuleDescriptor<Name> | Name,
): NativeModuleClient<Name> {
  const name = typeof descriptor === 'string' ? descriptor : descriptor.name;

  return {
    name,

    isAvailable(): boolean {
      return Object.prototype.hasOwnProperty.call(getHost().getRuntimeInfo().modules, name);
    },

    version(): string | undefined {
      return getHost().getRuntimeInfo().modules[name];
    },

    callSync<Result extends NativeValue | undefined = NativeValue | undefined>(
      method: string,
      args: readonly NativeValue[] = [],
    ): Result {
      return getHost().callModuleSync(name, method, [...args]) as Result;
    },
  };
}

export function requireNativeModule<const Name extends string>(
  descriptor: NativeModuleDescriptor<Name> | Name,
): NativeModuleClient<Name> {
  const module = createNativeModule(descriptor);
  if (!module.isAvailable()) {
    throw new Error(`Native module ${module.name} is not installed in this Sting host.`);
  }
  return module;
}
