import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDevelopmentMode } from './development.js';

test('dev guidance points developers at Sting Go', () => {
  assert.match(resolveDevelopmentMode('dev', []).guidance, /Sting Go/);
});
