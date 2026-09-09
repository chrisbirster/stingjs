# StingJS versioning and compatibility

StingJS uses SemVer for the public application platform. All first-party public npm packages ship on one synchronized version so an application can reason about the SDK, CLI, modules, and creator as one release train.

## What the version covers

The synchronized version applies to `@stingjs/core`, `@stingjs/solid`, `@stingjs/native`, `@stingjs/stylex`, `@stingjs/modules-core`, all first-party `@stingjs/*` modules, `@stingjs/cli`, and `create-sting`.

A **major** release may make incompatible changes to documented application APIs, CLI/config contracts, module manifest contracts, or generated native-host integration. A **minor** release adds backward-compatible platform capabilities. A **patch** release contains backward-compatible fixes and release/tooling corrections.

After 1.0, a documented public API should be deprecated before removal whenever practical. Engine-owned QuickJS values, Swift/UIKit objects, Kotlin/JNI objects, and other implementation details are not public compatibility contracts.

## Release candidates

Prerelease versions use standard SemVer identifiers such as `1.0.0-rc.1`. They publish under the npm `next` dist-tag and may still change before the stable release. Stable versions publish under `latest`.

The root monorepo package stays private; only the documented public package set is published.

## Compatibility policy

- Applications should keep first-party Sting packages on the same version.
- Generated native hosts and the JavaScript SDK are tested as one release cohort.
- `sting.config.ts` and `sting-module.json` are public configuration contracts; incompatible schema changes require a major release once 1.0 is stable.
- Official QuickJS is an internal production engine choice, not an application-selectable API.
- JavaScriptCore and QuickJS-NG reference lanes do not create public compatibility obligations.

See `docs/upgrading.md` for the supported upgrade procedure and `docs/releasing.md` for the maintainer release process.
