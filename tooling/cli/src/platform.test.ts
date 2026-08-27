import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDoctorChecks, parseAdbDevices, parseJavaMajor, parseSimctlDevices } from './platform.js';

test('doctor does not require Zig for normal Sting app development', () => {
  const zig = collectDoctorChecks('linux').find((check) => check.name === 'zig');
  assert.ok(zig);
  assert.equal(zig.required, false);
  assert.equal(zig.skipped, true);
  assert.match(zig.detail, /not required for Sting app development/);
});

test('runtime doctor requires Zig for Sting runtime contributors', () => {
  const zig = collectDoctorChecks('linux', { runtimeDevelopment: true }).find((check) => check.name === 'zig');
  assert.ok(zig);
  assert.equal(zig.required, true);
  assert.equal(zig.skipped, undefined);
});

test('android doctor makes Android toolchain checks required', () => {
  const checks = collectDoctorChecks('linux', { target: 'android' });
  assert.equal(checks.find((check) => check.name === 'java')?.required, true);
  assert.equal(checks.find((check) => check.name === 'android sdk')?.required, true);
  assert.equal(checks.find((check) => check.name === 'adb')?.required, true);
});

test('ios doctor fails clearly on a non-macOS host', () => {
  const checks = collectDoctorChecks('linux', { target: 'ios' });
  const xcode = checks.find((check) => check.name === 'xcode');
  const simctl = checks.find((check) => check.name === 'simctl');
  assert.deepEqual([xcode?.required, xcode?.ok], [true, false]);
  assert.deepEqual([simctl?.required, simctl?.ok], [true, false]);
});

test('parseJavaMajor understands common Java version output', () => {
  assert.equal(parseJavaMajor('openjdk version "17.0.16" 2026-07-15'), 17);
  assert.equal(parseJavaMajor('java version "1.8.0_402"'), 8);
  assert.equal(parseJavaMajor('openjdk 21.0.8 2026-07-15'), 21);
});

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
