export default {
  name: 'Sting Hello World',
  bundle: 'dist/sting-app.js',
  ios: {
    project: 'ios/StingHelloWorld.xcodeproj',
    scheme: 'StingHelloWorld',
    bundleIdentifier: 'com.stingjs.helloworld',
    configuration: 'Debug',
  },
  android: {
    directory: 'android',
    package: 'run.stingjs.helloworld',
    variant: 'debug',
  },
};
