# create-sting

Project creator for standalone Sting applications.

The creator generates a Solid 2/Vite application plus native Android and iOS projects that consume Sting's distributable production hosts. Ordinary generated-app builds do not invoke Zig and do not reference Sting repository source paths.

Repository/CI usage can inject freshly built artifacts explicitly:

```bash
node dist/cli.js my-app \
  --runtime-artifacts /path/to/android-host \
  --ios-runtime-artifacts /path/to/ios-host
```

The iOS path may point either at the packaged `StingQuickJSRuntime` directory itself or at the parent directory produced by `scripts/package-ios-host.sh`.

For local development, `STING_ANDROID_HOST_ARTIFACTS` and `STING_IOS_HOST_ARTIFACTS` provide the same overrides. A published creator stages the release hosts under `runtime/android` and `runtime/ios`, making the intended user path:

```bash
npm create sting@latest my-app
cd my-app
npm install
sting doctor
sting test
sting run ios
sting run android
```

Official QuickJS is the production engine on both native platforms. The generated iOS application links the packaged `StingQuickJSRuntime`; it does not use the JavaScriptCore reference host as a production substitute.
