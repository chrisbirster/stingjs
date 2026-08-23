import type { StingNativeErrorData } from './types.js';

export class StingNativeError extends Error {
  readonly code: string;
  readonly module: string;
  readonly method: string;
  readonly details: StingNativeErrorData['details'];

  constructor(data: StingNativeErrorData) {
    super(data.message);
    this.name = 'StingNativeError';
    this.code = data.code;
    this.module = data.module;
    this.method = data.method;
    this.details = data.details;
  }
}
