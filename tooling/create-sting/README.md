# create-sting

Project creator for standalone Sting applications.

Current foundation generates the Solid/Vite application and the distributable Android host path. It consumes prebuilt `sting-runtime.aar` and `sting-quickjs.aar` artifacts; generated Android builds do not invoke Zig or reference Sting repository source paths.

```bash
node dist/cli.js my-app --runtime-artifacts /path/to/android-host
```

For local development, `STING_ANDROID_HOST_ARTIFACTS` may point at the directory containing the two AARs. A packaged creator can instead ship them under `runtime/android` so `npm create sting@latest my-app` needs no extra flag.

The production iOS template is intentionally deferred until the official QuickJS SwiftPM package from #73 is mergeable and distributable. The creator will not generate the JavaScriptCore reference host as a fake production application template.
