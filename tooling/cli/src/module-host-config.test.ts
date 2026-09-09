import assert from 'node:assert/strict';
import test from 'node:test';
import { renderAndroidHostManifest, renderIOSInfoPlist } from './module-host-config.js';
import type { StingModulePlan } from './modules.js';

const plan: StingModulePlan = {
  schemaVersion: 1,
  modules: [],
  android: {
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_CONTACTS',
    ],
  },
  ios: {
    requiredInfoPlistKeys: [
      'NSCameraUsageDescription',
      'NSContactsUsageDescription',
    ],
  },
};

const appManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Demo">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
</manifest>
`;

const cameraManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-feature android:name="android.hardware.camera.any" android:required="false" />
    <application>
        <activity android:name="run.stingjs.modules.camera.CameraPermissionActivity" android:exported="false" />
    </application>
</manifest>`;

const contactsManifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity android:name="run.stingjs.modules.contacts.ContactsPickerActivity" android:exported="false" />
    </application>
</manifest>`;

test('injects permissions, features, and module application components idempotently', () => {
  const rendered = renderAndroidHostManifest(appManifest, plan, [cameraManifest, contactsManifest]);
  assert.match(rendered, /android\.permission\.CAMERA/);
  assert.match(rendered, /android\.permission\.READ_CONTACTS/);
  assert.match(rendered, /android\.hardware\.camera\.any/);
  assert.match(rendered, /run\.stingjs\.modules\.camera\.CameraPermissionActivity/);
  assert.match(rendered, /run\.stingjs\.modules\.contacts\.ContactsPickerActivity/);
  assert.equal((rendered.match(/STING MODULES ROOT BEGIN/g) ?? []).length, 1);
  assert.equal((rendered.match(/STING MODULES APP BEGIN/g) ?? []).length, 1);

  const rerendered = renderAndroidHostManifest(rendered, plan, [cameraManifest, contactsManifest]);
  assert.equal(rerendered, rendered);
});

test('renders a standalone iOS plist with required descriptions and overrides', () => {
  const rendered = renderIOSInfoPlist(plan, 'Example App', {
    NSCameraUsageDescription: 'Take profile photos & scan codes.',
  });

  assert.match(rendered, /<key>NSCameraUsageDescription<\/key>/);
  assert.match(rendered, /Take profile photos &amp; scan codes\./);
  assert.match(rendered, /<key>NSContactsUsageDescription<\/key>/);
  assert.match(rendered, /Example App accesses contacts when you choose contact features\./);
  assert.match(rendered, /\$\(PRODUCT_BUNDLE_IDENTIFIER\)/);
});
