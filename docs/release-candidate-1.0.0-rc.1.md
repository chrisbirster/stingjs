# StingJS 1.0.0-rc.1 promotion checklist

This document is the concrete promotion path for the first StingJS 1.0 release candidate. It does not waive the stable-release evidence gates.

## 1. Freeze the candidate on `dev`

Start from the exact `dev` commit after all RC-preparation PRs are merged.

```bash
npm install
npm run release:version -- 1.0.0-rc.1
npm run release:check:packages
npm run typecheck
npm test
npm run build
```

Commit the synchronized version change and update this changelog entry from `unreleased` to the release date. The PR Gate for that exact head must be green before merge.

## 2. Verify the package/release graph

Before promotion, confirm the candidate produces:

- 21 scoped/unscoped SDK, module, and CLI tarballs plus `create-sting` for exactly 22 npm packages;
- distributable Android native-host AARs;
- distributable official-QuickJS iOS host ZIP;
- Sting Go Android developer-client APK + SHA-256 metadata;
- Sting Go iOS Simulator developer-client ZIP + SHA-256 metadata;
- no `workspace:`, `file:`, `link:`, absolute-path, or monorepo-relative dependency in any public package;
- no ordinary generated-app requirement for Zig or a Sting source checkout.

## 3. Promote the exact commit

Promote the exact green release-preparation commit from `dev` to `main` through the Promotion Gate. Do not recreate, cherry-pick, or amend the candidate after the gate; the release workflow must run on the exact promoted commit.

## 4. Dispatch the RC release

From `main`, run `.github/workflows/release.yml` with:

```text
tag = v1.0.0-rc.1
publish_npm = false
```

The packaging-only run must succeed first. The workflow classifies the version as a prerelease and uses npm dist-tag `next`.

## 5. Bootstrap npm and prove OIDC

Complete #135 for every public package. npm requires each package to exist before its trusted publisher can be configured, so the first package creation requires the maintainer's npm account/2FA or another npm-supported one-time bootstrap mechanism.

After the package surfaces exist, configure trusted publishing for:

```text
GitHub user: chrisbirster
Repository: stingjs
Workflow: release.yml
```

Then rerun the exact same `main` candidate with:

```text
tag = v1.0.0-rc.1
publish_npm = true
```

Normal publication must succeed through GitHub OIDC without `NPM_TOKEN`. Revoke any bootstrap publishing credential afterward.

## 6. Validate the independent consumer

Complete #134 in a repository outside `chrisbirster/stingjs`. It must use registry packages only and must not use a Sting source checkout, tarball path, `file:`, `link:`, or workspace dependency.

The RC smoke is:

```bash
npm create sting@next my-app
cd my-app
npm install
npx sting doctor
npx sting test
npx sting ci
npx sting run ios
npx sting run android
```

Record the exact RC version, consumer commit, OS/toolchain, and build/run results.

## 7. Finish the stable-only physical evidence gate

Complete #5 with same-device physical Android release evidence comparing Sting/official QuickJS against the React Native/Hermes control. Simulator or emulator results do not satisfy this gate.

If the evidence exposes a severe correctness or runtime bottleneck, fix only the measured blocker and cut another RC. Do not optimize from speculation.

## 8. Promote stable 1.0

When #5, #134, #135, and #70 are complete, prepare `1.0.0` with the same atomic version command, rerun exact-head PR and Promotion Gates, and dispatch `release.yml` from the exact promoted `main` commit with npm publishing enabled. Stable publication uses npm dist-tag `latest` and must pass `release:check:final`.
