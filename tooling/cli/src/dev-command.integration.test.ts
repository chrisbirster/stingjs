import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDevelopmentMode } from './development.js';

test('canonical dev command uses the same server option surface while forcing watch mode', () => {
  const args = [
    '--project-root', '/tmp/example',
    '--bundle', 'dist/custom.js',
    '--host', '127.0.0.1',
    '--port', '8081',
    '--qr',
    '--json',
  ];

  const mode = resolveDevelopmentMode('dev', args);
  assert.equal(mode.command, 'dev');
  assert.equal(mode.watch, true);
  assert.equal(args.includes('--watch'), false);
});
