import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDevelopmentMode } from './development.js';

test('sting start remains a non-watching server by default', () => {
  const mode = resolveDevelopmentMode('start', []);
  assert.equal(mode.watch, false);
  assert.equal(mode.title, 'Sting development server');
});

test('sting start --watch preserves the existing managed watcher behavior', () => {
  assert.equal(resolveDevelopmentMode('start', ['--watch']).watch, true);
});

test('sting dev always enables build/watch/live-reload mode', () => {
  const mode = resolveDevelopmentMode('dev', []);
  assert.equal(mode.watch, true);
  assert.equal(mode.title, 'Sting development session');
  assert.match(mode.guidance, /Sting Go/);
});

test('sting dev remains watching when normal server flags are supplied', () => {
  const mode = resolveDevelopmentMode('dev', ['--port', '9000', '--no-qr', '--json']);
  assert.equal(mode.watch, true);
});
