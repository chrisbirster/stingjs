import {
  getHost,
  registerRuntimeDisposer,
  StingNativeError,
  type NativeValue,
  type StingHost,
} from '@stingjs/core';

const OBJECT_CREATE_METHOD = '__sting_object_create';
const OBJECT_CALL_SYNC_METHOD = '__sting_object_call_sync';
const OBJECT_CALL_ASYNC_METHOD = '__sting_object_call_async';
const OBJECT_DISPOSE_METHOD = '__sting_object_dispose';
const PERMISSION_STATUS_METHOD = '__sting_permission_status';
const PERMISSION_REQUEST_METHOD = '__sting_permission_request';

export type NativePermissionStatus =
  | 'undetermined'
  | 'denied'
  | 'granted'
  | 'restricted'
  | 'limited';

export interface NativeModuleDescriptor<Name extends string = string> {
  readonly name: Name;
}

export interface NativeModuleSubscription {
  remove(): void;
}

export type NativeModuleEventListener<Payload extends NativeValue = NativeValue> =
  (payload: Payload) => void;

export interface NativeModuleObject<ModuleName extends string = string> {
  readonly module: ModuleName;
  readonly type: string;
  readonly disposed: boolean;
  callSync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args?: readonly NativeValue[],
  ): Result;
  callAsync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args?: readonly NativeValue[],
  ): Promise<Result>;
  dispose(): void;
}

export interface NativeModuleClient<Name extends string = string> {
  readonly name: Name;
  isAvailable(): boolean;
  version(): string | undefined;
  callSync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args?: readonly NativeValue[],
  ): Result;
  callAsync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args?: readonly NativeValue[],
  ): Promise<Result>;
  permissionStatus(permission: string): NativePermissionStatus;
  requestPermission(permission: string): Promise<NativePermissionStatus>;
  addListener<Payload extends NativeValue = NativeValue>(
    event: string,
    listener: NativeModuleEventListener<Payload>,
  ): NativeModuleSubscription;
  createObject(
    type: string,
    args?: readonly NativeValue[],
  ): NativeModuleObject<Name>;
}

function objectError(
  error: unknown,
  module: string,
  method: string,
): never {
  if (error instanceof StingNativeError) {
    throw new StingNativeError({
      code: error.code,
      message: error.message,
      module,
      method,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  throw error;
}

function requirePermissionName(permission: string): string {
  const normalized = permission.trim();
  if (!normalized) {
    throw new TypeError('Native permission name must not be empty');
  }
  return normalized;
}

function requirePermissionStatus(
  value: NativeValue | undefined,
  module: string,
  permission: string,
): NativePermissionStatus {
  switch (value) {
    case 'undetermined':
    case 'denied':
    case 'granted':
    case 'restricted':
    case 'limited':
      return value;
    default:
      throw new StingNativeError({
        code: 'E_INVALID_PERMISSION_STATUS',
        message: `Native module ${module} returned an invalid status for permission ${permission}.`,
        module,
        method: 'permissionStatus',
        details: value ?? null,
      });
  }
}

class NativeModuleObjectClient<Name extends string> implements NativeModuleObject<Name> {
  private wrapperDisposed = false;
  private nativeReleased = false;
  private readonly unregisterRuntimeDisposer: () => void;

  constructor(
    private readonly host: StingHost,
    readonly module: Name,
    readonly type: string,
    private readonly handle: number,
  ) {
    this.unregisterRuntimeDisposer = registerRuntimeDisposer(host, () => {
      this.disposeFromRuntime();
    });
  }

  get disposed(): boolean {
    return this.wrapperDisposed;
  }

  callSync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args: readonly NativeValue[] = [],
  ): Result {
    this.assertActive(method);
    if (!method) throw new TypeError('Native object method name must not be empty');

    try {
      return this.host.callModuleSync(
        this.module,
        OBJECT_CALL_SYNC_METHOD,
        [this.handle, method, ...args],
      ) as Result;
    } catch (error) {
      objectError(error, this.module, method);
    }
  }

  async callAsync<Result extends NativeValue | undefined = NativeValue | undefined>(
    method: string,
    args: readonly NativeValue[] = [],
  ): Promise<Result> {
    this.assertActive(method);
    if (!method) throw new TypeError('Native object method name must not be empty');

    try {
      return await this.host.callModuleAsync(
        this.module,
        OBJECT_CALL_ASYNC_METHOD,
        [this.handle, method, ...args],
      ) as Result;
    } catch (error) {
      objectError(error, this.module, method);
    }
  }

  dispose(): void {
    if (this.wrapperDisposed) return;
    this.wrapperDisposed = true;

    try {
      this.releaseNative();
    } catch (error) {
      objectError(error, this.module, 'dispose');
    }
  }

  private assertActive(method: string): void {
    if (!this.wrapperDisposed) return;
    throw new StingNativeError({
      code: 'E_OBJECT_DISPOSED',
      message: `Native ${this.type} object has already been disposed.`,
      module: this.module,
      method,
    });
  }

  private releaseNative(): void {
    if (this.nativeReleased) return;

    this.host.callModuleSync(this.module, OBJECT_DISPOSE_METHOD, [this.handle]);
    this.nativeReleased = true;
    this.unregisterRuntimeDisposer();
  }

  private disposeFromRuntime(): void {
    this.wrapperDisposed = true;
    if (this.nativeReleased) return;

    try {
      this.host.callModuleSync(this.module, OBJECT_DISPOSE_METHOD, [this.handle]);
      this.nativeReleased = true;
    } catch {
      // Native registries provide a final runtime-teardown fallback. The JS
      // wrapper is already retired and must never become usable again.
    }
  }
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

    callAsync<Result extends NativeValue | undefined = NativeValue | undefined>(
      method: string,
      args: readonly NativeValue[] = [],
    ): Promise<Result> {
      return getHost().callModuleAsync(name, method, [...args]) as Promise<Result>;
    },

    permissionStatus(permission: string): NativePermissionStatus {
      const normalized = requirePermissionName(permission);
      const value = getHost().callModuleSync(name, PERMISSION_STATUS_METHOD, [normalized]);
      return requirePermissionStatus(value, name, normalized);
    },

    async requestPermission(permission: string): Promise<NativePermissionStatus> {
      const normalized = requirePermissionName(permission);
      const value = await getHost().callModuleAsync(name, PERMISSION_REQUEST_METHOD, [normalized]);
      return requirePermissionStatus(value, name, normalized);
    },

    addListener<Payload extends NativeValue = NativeValue>(
      event: string,
      listener: NativeModuleEventListener<Payload>,
    ): NativeModuleSubscription {
      const remove = getHost().addModuleEventListener(
        name,
        event,
        listener as NativeModuleEventListener,
      );
      return { remove };
    },

    createObject(
      type: string,
      args: readonly NativeValue[] = [],
    ): NativeModuleObject<Name> {
      if (!type) throw new TypeError('Native object type must not be empty');
      const host = getHost();

      let handle: NativeValue | undefined;
      try {
        handle = host.callModuleSync(name, OBJECT_CREATE_METHOD, [type, ...args]);
      } catch (error) {
        objectError(error, name, `create:${type}`);
      }

      if (!Number.isSafeInteger(handle) || (handle as number) <= 0) {
        throw new StingNativeError({
          code: 'E_INVALID_OBJECT_HANDLE',
          message: `Native module ${name} returned an invalid handle for ${type}.`,
          module: name,
          method: `create:${type}`,
          details: handle ?? null,
        });
      }

      return new NativeModuleObjectClient(host, name, type, handle as number);
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
