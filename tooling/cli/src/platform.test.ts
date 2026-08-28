import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDoctorChecks, parseAdbDevices, parseSimctlDevices } from './platform.js';

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

test('Android project doctor makes the Android toolchain required', () => {
  const checks = collectDoctorChecks('linux', { android: true, requireSystemGradle: true });
  for (const name of ['java', 'android sdk', 'adb', 'gradle']) {
    const check = checks.find((candidate) => candidate.name === name);
    assert.ok(check, `${name} check should exist`);
    assert.equal(check.required, true, `${name} should be required for an Android project`);
  }
});

test('iOS project doctor requires Xcode tools on macOS', () => {
  const checks = collectDoctorChecks('darwin', { ios: true });
  assert.equal(checks.find((check) => check.name === 'xcode')?.required, true);
  assert.equal(checks.find((check) => check.name === 'simctl')?.required, true);
});

test('iOS project doctor skips the iOS toolchain off macOS', () => {
  const check = collectDoctorChecks('linux', { ios: true }).find((candidate) => candidate.name === 'ios toolchain');
  assert.ok(check);
  assert.equal(check.required, false);
  assert.equal(check.skipped, true);
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
