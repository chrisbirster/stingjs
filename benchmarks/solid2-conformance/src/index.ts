import { createConformanceApi } from './harness/registry.js';
import type { ConformanceApi } from './harness/types.js';

declare global {
  var __stingSolid2Conformance: ConformanceApi | undefined;
}

globalThis.__stingSolid2Conformance = createConformanceApi();
