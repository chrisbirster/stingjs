import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndroidApplicationId, parseXcodeBuildSetting, selectDevice } from './run.js';
import type { StingDevice } from './platform.js';

const devices: StingDevice[] = [
  { platform: 'ios', id: 'SIM-1', name: 'iPhone 17 Pro', kind: 'simulator', state: 'shutdown' },
  { platform: 'ios', id: 'SIM-2', name: 'iPhone 16', kind: 'simulator', state: 'booted' },
  { platform: 'android', id: 'PHONE-1', name: 'Pixel 9', kind: 'physical', state: 'device' },
  { platform: 'android', id: 'emulator-5554', name: 'Pixel Emulator', kind: 'emulator', state: 'offline' },
];

test('selectDevice prefers a booted iOS simulator', () => {
  assert.equal(selectDevice(devices, 'ios').id, 'SIM-2');
});

test('selectDevice matches a requested device by name or id', () => {
  assert.equal(selectDevice(devices, 'ios', 'iPhone 17 Pro').id, 'SIM-1');
  assert.equal(selectDevice(devices, 'android', 'PHONE-1').name, 'Pixel 9');
});

test('selectDevice ignores unusable Android devices', () => {
  assert.throws(() => selectDevice(devices, 'android', 'emulator-5554'), /No android device matches/);
});

test('parseAndroidApplicationId supports Kotlin and Groovy Gradle syntax', () => {
  assert.equal(parseAndroidApplicationId('applicationId = "run.stingjs.example"'), 'run.stingjs.example');
  assert.equal(parseAndroidApplicationId("applicationId 'run.stingjs.groovy'"), 'run.stingjs.groovy');
});

test('parseXcodeBuildSetting extracts a named build setting', () => {
  const output = `Build settings for action build and target StingHelloWorld:\n    PRODUCT_NAME = StingHelloWorld\n    PRODUCT_BUNDLE_IDENTIFIER = com.stingjs.helloworld\n`;
  assert.equal(parseXcodeBuildSetting(output, 'PRODUCT_BUNDLE_IDENTIFIER'), 'com.stingjs.helloworld');
});
