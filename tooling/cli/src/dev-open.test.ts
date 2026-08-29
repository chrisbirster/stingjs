import assert from 'node:assert/strict';
import test from 'node:test';
import { selectStingGoOpenDevice, stingGoOpenCommand } from './dev-open.js';
import type { StingDevice } from './platform.js';

const devices: StingDevice[] = [
  { platform: 'android', id: 'emulator-5554', name: 'Pixel 9', kind: 'emulator', state: 'device' },
  { platform: 'ios', id: 'IOS-BOOTED', name: 'iPhone 17 Pro', kind: 'simulator', state: 'booted' },
  { platform: 'ios', id: 'IOS-OFF', name: 'iPhone 17', kind: 'simulator', state: 'shutdown' },
];

test('auto-open prefers a booted iOS Simulator on macOS', () => {
  assert.equal(selectStingGoOpenDevice(devices, 'darwin').id, 'IOS-BOOTED');
});

test('auto-open prefers connected Android when iOS tooling is unavailable', () => {
  assert.equal(selectStingGoOpenDevice(devices, 'linux').id, 'emulator-5554');
});

test('auto-open can target a ready device by name or id', () => {
  assert.equal(selectStingGoOpenDevice(devices, 'darwin', 'Pixel 9').id, 'emulator-5554');
  assert.equal(selectStingGoOpenDevice(devices, 'darwin', 'IOS-BOOTED').name, 'iPhone 17 Pro');
});

test('auto-open rejects a requested simulator that is not booted', () => {
  assert.throws(
    () => selectStingGoOpenDevice(devices, 'darwin', 'iPhone 17'),
    /not ready for Sting Go/,
  );
});

test('iOS opens the existing Sting Go deep link through simctl', () => {
  const command = stingGoOpenCommand(devices[1], 'sting://go?url=http%3A%2F%2Flocalhost%3A8081%2Fmanifest');
  assert.equal(command.command, 'xcrun');
  assert.deepEqual(command.args.slice(0, 3), ['simctl', 'openurl', 'IOS-BOOTED']);
});

test('Android targets the first-party Sting Go package through adb', () => {
  const command = stingGoOpenCommand(devices[0], 'sting://go?url=http%3A%2F%2Flocalhost%3A8081%2Fmanifest');
  assert.equal(command.command, 'adb');
  assert.deepEqual(command.args.slice(0, 4), ['-s', 'emulator-5554', 'shell', 'am']);
  assert.ok(command.args.includes('run.stingjs.go'));
});
