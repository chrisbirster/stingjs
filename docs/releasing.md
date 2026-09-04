# StingJS release process

StingJS releases move `feature -> dev -> main`. `dev` is the integration branch; `main` is the exact release branch for both prereleases and stable releases. The stable workflow filename is `.github/workflows/release.yml` because npm trusted-publisher configuration binds to the workflow filename.

## Prepare a version

All 22 public packages use one synchronized version. Prepare the package train atomically with:

```bash
npm run release:version -- 1.0.0-rc.1
npm run release:check:packages
```

`release:version` prevalidates the complete public package set, updates the root and every public manifest plus internal Sting dependency pins, writes through temporary files, and rolls the transaction back if the post-write package invariant fails. Do not hand-edit only part of the package train.

Update `CHANGELOG.md`, run the full PR Gate, and merge the release-preparation PR into `dev`. Then promote that exact release candidate from `dev` to `main` through the Promotion Gate.

Prerelease versions use SemVer such as `1.0.0-rc.1` and publish under npm's `next` dist-tag. Stable versions such as `1.0.0` publish under `latest` and must additionally pass the final physical-device evidence gate. Both prerelease and stable workflows are dispatched only from promoted `main` commits.

## npm trusted publishing

StingJS uses npm trusted publishing with GitHub Actions OIDC rather than a long-lived npm write token. The workflow requires `id-token: write`; trusted publishing automatically attaches provenance for this public repository.

There is one unavoidable bootstrap step: npm requires a package to exist before a trusted publisher can be configured. For the first publication of each package, a maintainer must publish it interactively with npm account 2FA or another npm-supported one-time bootstrap credential. After each package exists:

1. Configure its npm Trusted Publisher for GitHub user `chrisbirster`, repository `stingjs`, workflow filename `release.yml`, allowing `npm publish`.
2. Verify the package repository points to `git+https://github.com/chrisbirster/stingjs.git`.
3. Run `release.yml` with npm publication enabled and verify OIDC publication succeeds.
4. On npm, require 2FA and disallow traditional tokens for package publishing.
5. Revoke any bootstrap automation credential; normal releases must not require `NPM_TOKEN`.

The registry bootstrap/OIDC proof is tracked by #135. The repository's `scripts/check-public-packages.mjs` prevents package version, visibility, repository identity, and internal-dependency drift.

## Release workflow

Run **Release** manually from `main` on the exact promoted release commit and provide a tag equal to `v` plus the committed root package version. Leave **Publish npm packages** disabled when exercising packaging only.

The workflow:

- runs the software and package-release gates;
- builds Android release artifacts and proves the prebuilt host works without Zig;
- builds/tests the production iOS host and proves the distributable host works without Zig;
- packages the Sting Go Android developer-client APK and iOS Simulator developer-client ZIP, with SHA-256 metadata, into the same release bundle;
- packs every public SDK/CLI package;
- builds the `create-sting` tarball with the real Android/iOS native host artifacts embedded;
- optionally publishes the 22-package npm train in dependency order using OIDC;
- creates a GitHub prerelease or stable release from the exact commit.

## 1.0 RC promotion

The concrete first-RC checklist lives in [`release-candidate-1.0.0-rc.1.md`](release-candidate-1.0.0-rc.1.md). A release candidate may be used to finish independent-consumer and registry validation, but stable 1.0 cannot bypass the explicit final gates.

Before stable 1.0:

- #134 must prove a genuinely independent external repository can consume the RC with no Sting source checkout or local/file dependencies;
- #135 must prove the normal npm package train publishes through trusted OIDC after bootstrap;
- #5 must contain same-device physical Android Sting/official-QuickJS vs React Native/Hermes release evidence;
- #70 must have no remaining 1.0 release blockers.

Current npm trusted-publishing documentation: https://docs.npmjs.com/trusted-publishers/
