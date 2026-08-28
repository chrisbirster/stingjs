import { defineConfig } from '@stingjs/cli/config';

export default defineConfig({
  name: '__PROJECT_DISPLAY_NAME__',
  bundle: 'dist/sting-app.js',
  android: {
    directory: 'android',
    package: '__ANDROID_PACKAGE__',
    variant: 'debug',
  },
});
