import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedAppScripts } from './verify.js';

test('selectedAppScripts runs typecheck, tests, then build when available', () => {
  assert.deepEqual(selectedAppScripts({
    scripts: {
      build: 'vite build',
      test: 'vitest run',
      typecheck: 'tsc --noEmit',
      lint: 'eslint .',
    },
  }), ['typecheck', 'test', 'build']);
});

test('selectedAppScripts allows projects without a test script', () => {
  assert.deepEqual(selectedAppScripts({
    scripts: {
      build: 'vite build',
      typecheck: 'tsc --noEmit',
    },
  }), ['typecheck', 'build']);
});

test('selectedAppScripts still surfaces build-only applications', () => {
  assert.deepEqual(selectedAppScripts({ scripts: { build: 'vite build' } }), ['build']);
});
