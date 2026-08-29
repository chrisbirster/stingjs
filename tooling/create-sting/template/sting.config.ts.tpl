import { defineConfig } from '@stingjs/cli/config';

export default defineConfig({
  name: '__PROJECT_DISPLAY_NAME__',
  bundle: 'dist/sting-app.js',
  ios: {
    project: 'ios/StingApp.xcodeproj',
    scheme: 'StingApp',
    bundleIdentifier: '__IOS_BUNDLE_IDENTIFIER__',
    configuration: 'Debug',
  },
  android: {
    directory: 'android',
    package: '__ANDROID_PACKAGE__',
    variant: 'debug',
  },
});
