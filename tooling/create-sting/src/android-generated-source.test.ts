import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const androidBuildTemplate = readFileSync(
  new URL('../template/android/app/build.gradle.kts.tpl', import.meta.url),
  'utf8',
);

test('compiles the generated Android module registry as Kotlin source', () => {
  assert.match(
    androidBuildTemplate,
    /sourceSets\.getByName\("main"\)\.kotlin\.directories\.add/,
  );
  assert.match(
    androidBuildTemplate,
    /\.sting\/generated\/android\/src\/main\/java/,
  );
  assert.doesNotMatch(
    androidBuildTemplate,
    /sourceSets\.getByName\("main"\)\.java\.srcDir/,
  );
});
