# StingJS release process

StingJS releases move `feature -> dev -> main`. `dev` is the integration branch; `main` is the stable release branch. The stable workflow filename is `.github/workflows/release.yml` because npm trusted-publisher configuration binds to the workflow filename.

## Prepare a version

All public packages use the same version. Before a release, update the root version and every public package version/internal Sting dependency together, update `CHANGELOG.md`, run the full PR Gate, and merge the release-preparation PR into `dev`.

Prerelease versions use SemVer such as `1.0.0-rc.1`. The release workflow accepts prereleases from `dev`. A stable version such as `1.0.0` is accepted only from `main` and must pass the final physical-device evidence gate.

## npm trusted publishing

StingJS uses npm trusted publishing with GitHub Actions OIDC rather than a long-lived npm write token. The workflow requires `id-token: write`; trusted publishing automatically attaches provenance for this public repository.

There is one unavoidable bootstrap step: npm requires a package to exist before a trusted publisher can be configured. For the first publication of each package, a maintainer must publish it interactively with npm account 2FA (or another npm-supported one-time bootstrap credential). After the package exists:

1. Configure its npm Trusted Publisher for GitHub user `chrisbirster`, repository `stingjs`, workflow filename `release.yml`, allowing `npm publish`.
2. Verify the package repository points to `git+https://github.com/chrisbirster/stingjs.git`.
3. Run `release.yml` with npm publication enabled and verify OIDC publication succeeds.
4. On npm, require 2FA and disallow traditional tokens for package publishing.
5. Revoke any bootstrap automation credential; normal releases must not require `NPM_TOKEN`.

The repository's `scripts/check-public-packages.mjs` prevents package version, visibility, repository identity, and internal-dependency drift.

## Release workflow

Run **Release** manually on the exact release commit and provide a tag equal to `v` plus the committed root package version. Leave **Publish npm packages** disabled when exercising packaging only.

The workflow:

- runs the software and package-release gates;
- builds Android release artifacts and proves the prebuilt host works without Zig;
- builds/tests the production iOS host and proves the distributable host works without Zig;
- packs every public SDK/CLI package;
- builds the `create-sting` tarball with the real Android/iOS native host artifacts embedded;
- optionally publishes npm packages in dependency order using OIDC;
- creates a GitHub prerelease or stable release from the exact commit.

Before stable 1.0, an independent external repository must consume the release candidate with no Sting source checkout and pass create/install/doctor/test/build/run smoke coverage. Final 1.0 also requires the performance/reliability evidence tracked by #5, #15, and #70.

Current npm trusted-publishing documentation: https://docs.npmjs.com/trusted-publishers/
