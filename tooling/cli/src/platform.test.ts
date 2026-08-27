import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAdbDevices, parseSimctlDevices } from './platform.js';

test('parseAdbDevices classifies physical devices and emulators', () => {
  const devices = parseAdbDevices(`List of devices attached\nR5CX12345 device product:foo model:Pixel_9 device:foo transport_id:1\nemulator-5554 device product:sdk model:sdk_gphone64_arm64 device:emu transport_id:2\n`);
  assert.deepEqual(devices, [
    { platform: 'android', id: 'R5CX12345', name: 'Pixel 9', kind: 'physical', state: 'device' },
    { platform: 'android', id: 'emulator-5554', name: 'sdk gphone64 arm64', kind: 'emulator', state: 'device' },
  ]);
});

test('parseSimctlDevices only returns available simulators', () => {
  const devices = parseSimctlDevices(JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
        { state: 'Booted', isAvailable: true, name: 'iPhone 17 Pro', udid: 'SIM-1' },
        { state: 'Shutdown', isAvailable: false, name: 'Old iPhone', udid: 'SIM-2' },
      ],
    },
  }));
  assert.deepEqual(devices, [
    { platform: 'ios', id: 'SIM-1', name: 'iPhone 17 Pro', kind: 'simulator', state: 'booted' },
  ]);
});
