import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTerminalQr, shouldRenderTerminalQr } from './qr.js';

test('renders QR by default only for an interactive terminal', () => {
  assert.equal(shouldRenderTerminalQr([], true), true);
  assert.equal(shouldRenderTerminalQr([], false), false);
  assert.equal(shouldRenderTerminalQr([], undefined), false);
});

test('--qr forces QR output and --no-qr wins when both are present', () => {
  assert.equal(shouldRenderTerminalQr(['--qr'], false), true);
  assert.equal(shouldRenderTerminalQr(['--no-qr'], true), false);
  assert.equal(shouldRenderTerminalQr(['--qr', '--no-qr'], true), false);
});

test('renders a compact terminal QR for the exact Sting Go deep link', async () => {
  const deepLink = 'sting://go?url=http%3A%2F%2F192.168.1.10%3A8081%2Fmanifest';
  const qr = await renderTerminalQr(deepLink);

  assert.ok(qr.length > 100);
  assert.match(qr, /[▀▄█]/u);
  assert.equal(qr.includes(deepLink), false);
});
