const NATIVE_MODULE_VIEW_PREFIX = '__sting_module_view__:';
const NATIVE_MODULE_VIEW_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export interface NativeModuleViewIdentity {
  readonly module: string;
  readonly viewType: string;
}

function assertSegment(label: string, value: string): void {
  if (!NATIVE_MODULE_VIEW_SEGMENT.test(value)) {
    throw new TypeError(
      `${label} must match ${NATIVE_MODULE_VIEW_SEGMENT.source} for a Sting native module view`,
    );
  }
}

/**
 * Encode a module-owned native view as an ordinary Sting host element type.
 *
 * The representation is framework-owned transport data. Applications and
 * module packages should normally use createNativeModuleView() from
 * @stingjs/solid rather than constructing this string themselves.
 */
export function encodeNativeModuleViewType(module: string, viewType: string): string {
  assertSegment('Native module name', module);
  assertSegment('Native module view type', viewType);
  return `${NATIVE_MODULE_VIEW_PREFIX}${module}:${viewType}`;
}

/**
 * Decode a Sting module-view host element identity.
 *
 * Non-module host types return null. A string using Sting's reserved prefix but
 * violating the identity grammar throws so malformed framework identities are
 * never silently treated as ordinary native elements.
 */
export function decodeNativeModuleViewType(type: string): NativeModuleViewIdentity | null {
  if (!type.startsWith(NATIVE_MODULE_VIEW_PREFIX)) return null;

  const body = type.slice(NATIVE_MODULE_VIEW_PREFIX.length);
  const separator = body.indexOf(':');
  if (separator <= 0 || separator === body.length - 1 || body.indexOf(':', separator + 1) !== -1) {
    throw new TypeError(`Malformed Sting native module view type: ${type}`);
  }

  const module = body.slice(0, separator);
  const viewType = body.slice(separator + 1);
  assertSegment('Native module name', module);
  assertSegment('Native module view type', viewType);
  return { module, viewType };
}

export const STING_NATIVE_MODULE_VIEW_PREFIX = NATIVE_MODULE_VIEW_PREFIX;
