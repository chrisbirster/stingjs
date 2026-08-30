import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateModuleConfiguration,
  discoverRepositoryModuleManifests,
  renderAndroidPermissionsManifest,
  renderConfigurationPlan,
  renderIOSPermissionRequirements,
  validatePlatformPermissions,
} from './sting-module-config.mjs';

function manifest({
  packageName,
  version = '1.0.0',
  ios = [],
  android = [],
}) {
  return {
    package: packageName,
    version,
    ios: { permissions: ios },
    android: { permissions: android },
  };
}

test('aggregates permissions deterministically and deduplicates shared declarations', () => {
  const plan = aggregateModuleConfiguration([
    manifest({
      packageName: '@stingjs/location',
      ios: ['NSLocationWhenInUseUsageDescription'],
      android: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
    }),
    manifest({
      packageName: '@stingjs/haptics',
      android: ['android.permission.VIBRATE'],
    }),
    manifest({
      packageName: '@stingjs/maps',
      ios: ['NSLocationWhenInUseUsageDescription'],
      android: ['android.permission.ACCESS_FINE_LOCATION'],
    }),
  ]);

  assert.deepEqual(plan, {
    schemaVersion: 1,
    modules: [
      { package: '@stingjs/haptics', version: '1.0.0' },
      { package: '@stingjs/location', version: '1.0.0' },
      { package: '@stingjs/maps', version: '1.0.0' },
    ],
    android: {
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.VIBRATE',
      ],
    },
    ios: {
      requiredInfoPlistKeys: ['NSLocationWhenInUseUsageDescription'],
    },
  });
});

test('renders stable Android and iOS host configuration inputs', () => {
  const plan = aggregateModuleConfiguration([
    manifest({
      packageName: '@stingjs/location',
      ios: ['NSLocationWhenInUseUsageDescription'],
      android: ['android.permission.ACCESS_FINE_LOCATION'],
    }),
  ]);

  assert.equal(
    renderAndroidPermissionsManifest(plan),
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
      '  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n' +
      '</manifest>\n',
  );
  assert.equal(
    renderIOSPermissionRequirements(plan),
    '{\n' +
      '  "schemaVersion": 1,\n' +
      '  "requiredInfoPlistKeys": [\n' +
      '    "NSLocationWhenInUseUsageDescription"\n' +
      '  ]\n' +
      '}\n',
  );
  assert.equal(renderConfigurationPlan(plan), `${JSON.stringify(plan, null, 2)}\n`);
});

test('rejects malformed and duplicate platform permission declarations', () => {
  assert.throws(
    () => validatePlatformPermissions(manifest({
      packageName: '@stingjs/bad-android',
      android: ['ACCESS CAMERA'],
    })),
    /invalid permission identifier/,
  );
  assert.throws(
    () => validatePlatformPermissions(manifest({
      packageName: '@stingjs/bad-ios',
      ios: ['Camera'],
    })),
    /invalid permission identifier/,
  );
  assert.throws(
    () => validatePlatformPermissions(manifest({
      packageName: '@stingjs/duplicate',
      android: ['android.permission.CAMERA', 'android.permission.CAMERA'],
    })),
    /duplicate permission/,
  );
});

test('rejects conflicting copies of the same module package', () => {
  assert.throws(
    () => aggregateModuleConfiguration([
      manifest({ packageName: '@stingjs/location', version: '1.0.0' }),
      manifest({ packageName: '@stingjs/location', version: '2.0.0' }),
    ]),
    /Conflicting Sting module configuration for @stingjs\/location/,
  );
  assert.throws(
    () => aggregateModuleConfiguration([
      manifest({ packageName: '@stingjs/location', android: ['android.permission.ACCESS_FINE_LOCATION'] }),
      manifest({ packageName: '@stingjs/location', android: ['android.permission.ACCESS_COARSE_LOCATION'] }),
    ]),
    /Conflicting Sting module configuration for @stingjs\/location/,
  );
});

test('accepts identical duplicate package configuration and emits it once', () => {
  const duplicate = manifest({
    packageName: '@stingjs/location',
    ios: ['NSLocationWhenInUseUsageDescription'],
  });
  const plan = aggregateModuleConfiguration([duplicate, structuredClone(duplicate)]);
  assert.equal(plan.modules.length, 1);
  assert.deepEqual(plan.ios.requiredInfoPlistKeys, ['NSLocationWhenInUseUsageDescription']);
});

test('current first-party manifests generate the expected permission plan', async () => {
  const manifests = await discoverRepositoryModuleManifests();
  const plan = aggregateModuleConfiguration(manifests);

  assert.deepEqual(plan.android.permissions, [
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.VIBRATE',
  ]);
  assert.deepEqual(plan.ios.requiredInfoPlistKeys, []);
  assert.deepEqual(
    plan.modules.map(module => module.package),
    [
      '@stingjs/clipboard',
      '@stingjs/device',
      '@stingjs/filesystem',
      '@stingjs/haptics',
      '@stingjs/network',
      '@stingjs/secure-store',
      '@stingjs/sharing',
    ],
  );
});
