import assert from 'node:assert/strict';
import test from 'node:test';
import { npmExecutable, npmShell } from './build-watch.js';

test('build watcher uses npm directly on POSIX hosts', () => {
  assert.equal(npmExecutable('darwin'), 'npm');
  assert.equal(npmExecutable('linux'), 'npm');
  assert.equal(npmShell('darwin'), false);
  assert.equal(npmShell('linux'), false);
});

test('build watcher uses npm.cmd through the Windows shell', () => {
  assert.equal(npmExecutable('win32'), 'npm.cmd');
  assert.equal(npmShell('win32'), true);
});
