import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStingProject } from './create.js';

function fixture(): {
  root: string;
  androidArtifacts: string;
  iosArtifacts: string;
  target: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'create-sting-'));
  const androidArtifacts = join(root, 'android-artifacts');
  const iosArtifacts = join(root, 'ios-artifacts');
  const iosPackage = join(iosArtifacts, 'StingQuickJSRuntime');
  const target = join(root, 'my-app');

  mkdirSync(androidArtifacts, { recursive: true });
  writeFileSync(join(androidArtifacts, 'sting-runtime.aar'), 'runtime-aar');
  writeFileSync(join(androidArtifacts, 'sting-quickjs.aar'), 'quickjs-aar');

  mkdirSync(join(iosPackage, 'Artifacts', 'StingQuickJSBinary.xcframework'), { recursive: true });
  mkdirSync(join(iosPackage, 'Sources', 'StingQuickJSRuntime'), { recursive: true });
  writeFileSync(join(iosPackage, 'Package.swift'), '// fake distributable StingQuickJSRuntime package\n');
  writeFileSync(join(iosPackage, 'Sources', 'StingQuickJSRuntime', 'marker.swift'), '// marker\n');
  writeFileSync(join(iosPackage, 'Artifacts', 'StingQuickJSBinary.xcframework', 'Info.plist'), '<plist/>\n');

  return { root, androidArtifacts, iosArtifacts, target };
}

test('creates a standalone Android and iOS Sting project from prebuilt hosts', () => {
  const { androidArtifacts, iosArtifacts, target } = fixture();
  const result = createStingProject({
    targetDir: target,
    projectName: 'my-app',
    androidPackage: 'com.example.myapp',
    iosBundleIdentifier: 'com.example.myapp.ios',
    runtimeArtifactsDir: androidArtifacts,
    iosRuntimeArtifactsDir: iosArtifacts,
  });

  assert.equal(result.projectName, 'my-app');
  assert.equal(result.androidPackage, 'com.example.myapp');
  assert.equal(result.iosBundleIdentifier, 'com.example.myapp.ios');

  const packageJson = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as {
    name: string;
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.name, 'my-app');
  assert.equal(packageJson.scripts.test, 'vitest run --passWithNoTests');
  assert.equal(readFileSync(join(target, 'android/app/libs/sting-runtime.aar'), 'utf8'), 'runtime-aar');
  assert.equal(readFileSync(join(target, 'android/app/libs/sting-quickjs.aar'), 'utf8'), 'quickjs-aar');

  const gradlew = readFileSync(join(target, 'android/gradlew'), 'utf8');
  const gradlewBat = readFileSync(join(target, 'android/gradlew.bat'), 'utf8');
  assert.match(gradlew, /VERSION=9\.5\.0/);
  assert.match(gradlewBat, /set VERSION=9\.5\.0/);

  if (process.platform !== 'win32') {
    const mode = statSync(join(target, 'android/gradlew')).mode;
    assert.notEqual(mode & 0o100, 0, 'generated android/gradlew must be executable');
  }

  const activity = readFileSync(
    join(target, 'android/app/src/main/java/com/example/myapp/MainActivity.kt'),
    'utf8',
  );
  assert.match(activity, /^package com\.example\.myapp/m);
  assert.match(activity, /OfficialQuickJsCandidateRuntime/);

  const appDelegate = readFileSync(join(target, 'ios/StingApp/AppDelegate.swift'), 'utf8');
  assert.match(appDelegate, /import StingQuickJSRuntime/);
  assert.match(appDelegate, /StingQuickJSRuntime\(rootView:/);
  assert.doesNotMatch(appDelegate, /JavaScriptCore/);

  const xcodeProject = readFileSync(join(target, 'ios/StingApp.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(xcodeProject, /relativePath = StingQuickJSRuntime;/);
  assert.match(xcodeProject, /productName = StingQuickJSRuntime;/);
  assert.match(xcodeProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.example\.myapp\.ios;/);
  assert.match(xcodeProject, /\.\.\/dist\/sting-app\.js/);

  assert.equal(
    readFileSync(join(target, 'ios/StingQuickJSRuntime/Package.swift'), 'utf8'),
    '// fake distributable StingQuickJSRuntime package\n',
  );

  const config = readFileSync(join(target, 'sting.config.ts'), 'utf8');
  assert.match(config, /project: 'ios\/StingApp\.xcodeproj'/);
  assert.match(config, /scheme: 'StingApp'/);
  assert.match(config, /bundleIdentifier: 'com\.example\.myapp\.ios'/);
  assert.match(config, /package: 'com\.example\.myapp'/);

  for (const path of [
    'android/settings.gradle.kts',
    'android/app/build.gradle.kts',
    'android/app/src/main/java/com/example/myapp/MainActivity.kt',
    'ios/StingApp.xcodeproj/project.pbxproj',
    'ios/StingApp/AppDelegate.swift',
  ]) {
    const contents = readFileSync(join(target, path), 'utf8');
    assert.doesNotMatch(contents, /\.\.\/\.\.\/\.\.\/(?:native|packages|runtime)\//);
  }
});

test('accepts the iOS package directory directly', () => {
  const { androidArtifacts, iosArtifacts, target } = fixture();
  const iosPackage = join(iosArtifacts, 'StingQuickJSRuntime');
  const result = createStingProject({
    targetDir: target,
    runtimeArtifactsDir: androidArtifacts,
    iosRuntimeArtifactsDir: iosPackage,
  });
  assert.equal(result.iosRuntimeArtifactsDir, iosPackage);
});

test('rejects a non-empty target unless force is used', () => {
  const { androidArtifacts, iosArtifacts, target } = fixture();
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'existing.txt'), 'keep me');
  assert.throws(
    () => createStingProject({
      targetDir: target,
      runtimeArtifactsDir: androidArtifacts,
      iosRuntimeArtifactsDir: iosArtifacts,
    }),
    /Target directory is not empty/,
  );
});

test('requires distributable Android host artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-sting-missing-android-'));
  const iosPackage = join(root, 'ios', 'StingQuickJSRuntime');
  mkdirSync(join(iosPackage, 'Artifacts', 'StingQuickJSBinary.xcframework'), { recursive: true });
  mkdirSync(join(iosPackage, 'Sources', 'StingQuickJSRuntime'), { recursive: true });
  writeFileSync(join(iosPackage, 'Package.swift'), '// package\n');
  assert.throws(
    () => createStingProject({
      targetDir: join(root, 'app'),
      runtimeArtifactsDir: join(root, 'missing'),
      iosRuntimeArtifactsDir: iosPackage,
    }),
    /Sting Android host artifacts were not found/,
  );
});

test('requires distributable iOS host artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'create-sting-missing-ios-'));
  const androidArtifacts = join(root, 'android');
  mkdirSync(androidArtifacts, { recursive: true });
  writeFileSync(join(androidArtifacts, 'sting-runtime.aar'), 'runtime-aar');
  writeFileSync(join(androidArtifacts, 'sting-quickjs.aar'), 'quickjs-aar');
  assert.throws(
    () => createStingProject({
      targetDir: join(root, 'app'),
      runtimeArtifactsDir: androidArtifacts,
      iosRuntimeArtifactsDir: join(root, 'missing'),
    }),
    /Sting iOS host artifacts were not found/,
  );
});
