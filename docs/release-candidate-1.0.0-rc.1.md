# StingJS 1.0.0-rc.1 promotion checklist

This document is the concrete promotion path for the first StingJS 1.0 release candidate. It does not waive the stable-release evidence gates.

## 1. Land the RC preparation on `dev`

Merge the repository-side RC preparation only after its exact-head PR Gate is green. At this point the repository remains on its pre-release version; do not manually publish `1.0.0-rc.1`.

The release-version transaction must continue to prove that all 22 public packages plus the generated-app template move as one cohort.

## 2. Create the one-time npm bootstrap cohort

npm requires a package to exist before a trusted publisher can be attached. Because npm package versions are immutable, the bootstrap publication must use a version that is **not** the real RC version.

Prepare the synchronized bootstrap cohort on `dev`:

```bash
npm install
npm run release:version -- 1.0.0-bootstrap.0
npm run release:check:packages
npm run typecheck
npm test
npm run build
```

The exact bootstrap head must pass the PR Gate and then be promoted unchanged to `main` through the Promotion Gate.

From that exact `main` commit, run `.github/workflows/release.yml` with:

```text
tag = v1.0.0-bootstrap.0
publish_npm = false
```

This packaging-only run must produce the complete release bundle:

- 21 SDK/module/CLI tarballs plus `create-sting` for exactly 22 npm packages;
- distributable Android native-host AARs;
- distributable official-QuickJS iOS host ZIP;
- Sting Go Android developer-client APK + SHA-256 metadata;
- Sting Go iOS Simulator developer-client ZIP + SHA-256 metadata;
- no `workspace:`, `file:`, `link:`, absolute-path, or monorepo-relative dependency in any public package;
- no ordinary generated-app requirement for Zig or a Sting source checkout.

## 3. Bootstrap package existence and trust

Collect the release bundle files into one local directory (for example `release-artifacts/`) including `npm-publish-order.txt` and all 22 npm tarballs. First validate without mutating npm:

```bash
npm run release:npm:bootstrap -- \
  release-artifacts \
  --version 1.0.0-bootstrap.0
```

The helper refuses real RC/stable versions, requires exactly 22 unique StingJS packages, validates public/repository metadata, and verifies that every tarball is the same `*-bootstrap.*` version.

Then use the authenticated maintainer npm account with account-level 2FA to perform the one-time package creation and trusted-publisher setup:

```bash
npm run release:npm:bootstrap -- \
  release-artifacts \
  --version 1.0.0-bootstrap.0 \
  --publish \
  --trust
```

The helper:

- publishes only under the non-default `bootstrap` dist-tag;
- skips an exact bootstrap version that is already present, making interrupted publication resumable;
- configures GitHub owner `chrisbirster`, repository `stingjs`, workflow `release.yml`, with `npm publish` permission;
- verifies trusted-publisher state after each package;
- refuses to overwrite an existing mismatched trusted publisher;
- waits two seconds between trust writes to reduce npm rate-limit risk.

Do **not** use `latest`, `next`, or `1.0.0-rc.1` for this manual step. The purpose of `1.0.0-bootstrap.0` is only to create each package surface so trusted publishing can be configured. Normal StingJS releases must not require `NPM_TOKEN` or another long-lived npm write secret.

## 4. Cut the real `1.0.0-rc.1` cohort

Return to current `dev` after the bootstrap setup is complete and prepare the real RC atomically:

```bash
npm install
npm run release:version -- 1.0.0-rc.1
npm run release:check:packages
npm run typecheck
npm test
npm run build
```

Update `CHANGELOG.md` from `unreleased` to the release date. The PR Gate for that exact head must be green before merge. Promote the exact merged candidate from `dev` to `main` through the Promotion Gate; do not recreate, cherry-pick, amend, or manually repack it after the gate.

## 5. Publish the real RC through OIDC

From the exact promoted `main` candidate, run `.github/workflows/release.yml` once with:

```text
tag = v1.0.0-rc.1
publish_npm = true
```

The workflow must publish the complete 22-package cohort through npm trusted publishing/OIDC under the `next` dist-tag, attach provenance, require no `NPM_TOKEN`, and create the GitHub prerelease from the same exact commit.

The real `1.0.0-rc.1` version must never be manually pre-published; npm versions are immutable and doing so would prevent the OIDC release from publishing that version.

## 6. Validate the independent consumer

Complete #134 in `chrisbirster/stingjs-gauntlet`. It must use registry packages only and must not use a Sting source checkout, tarball path, `file:`, `link:`, or workspace dependency.

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

Record the exact RC version, consumer commit, OS/toolchain, and build/run results. Also prove the released Sting Go client can connect through the documented QR/deep-link/reload flow.

## 7. Finish the stable-only physical evidence gate

Complete #5 with same-device physical Android release evidence comparing Sting/official QuickJS against the React Native/Hermes control. Simulator or emulator results do not satisfy this gate.

If the evidence exposes a severe correctness or runtime bottleneck, fix only the measured blocker and cut another RC. Do not optimize from speculation.

## 8. Promote stable 1.0

When #5, #134, #135, and #70 are complete, prepare `1.0.0` with the same atomic version command, rerun exact-head PR and Promotion Gates, and dispatch `release.yml` from the exact promoted `main` commit with npm publishing enabled. Stable publication uses npm dist-tag `latest` and must pass `release:check:final`.
