# StingJS release process

StingJS releases move `feature -> dev -> main`. `dev` is the integration branch; `main` is the exact release branch for prereleases, bootstrap packaging, and stable releases. The stable workflow filename is `.github/workflows/release.yml` because npm trusted-publisher configuration binds to the workflow filename.

## Prepare a version

All 22 public packages use one synchronized version. Prepare the package train atomically with:

```bash
npm run release:version -- <semver>
npm run release:check:packages
```

`release:version` prevalidates the complete public package set, updates the root and every public manifest plus internal Sting dependency pins and the generated-app template, writes through temporary files, and rolls the transaction back if the post-write package invariant fails. Do not hand-edit only part of the package train.

Update `CHANGELOG.md` for product releases, run the full PR Gate, and merge the release-preparation PR into `dev`. Then promote that exact candidate from `dev` to `main` through the Promotion Gate.

Prerelease product versions such as `1.0.0-rc.1` publish under npm's `next` dist-tag. Stable versions such as `1.0.0` publish under `latest` and must additionally pass the final physical-device evidence gate. Product releases are dispatched only from promoted `main` commits.

## npm trusted publishing

StingJS uses npm trusted publishing with GitHub Actions OIDC rather than a long-lived npm write token. The workflow requires `id-token: write`; trusted publishing automatically attaches provenance for this public repository.

There is one unavoidable bootstrap step: npm requires a package to exist before a trusted publisher can be configured. npm package versions are immutable, so **never manually publish the real RC version and then expect OIDC to publish that same version again**.

For the initial registry bootstrap:

1. Prepare a synchronized non-product prerelease cohort such as `1.0.0-bootstrap.0` with `npm run release:version -- 1.0.0-bootstrap.0`.
2. Pass the exact-head PR Gate and Promotion Gate and promote that exact bootstrap commit to `main`.
3. Run `release.yml` with `tag = v1.0.0-bootstrap.0` and `publish_npm = false` to build the complete 22-package release bundle without publishing it.
4. Collect `npm-publish-order.txt` and all 22 npm tarballs from that release bundle into one local directory.
5. Validate the bundle without changing npm:

```bash
npm run release:npm:bootstrap -- \
  release-artifacts \
  --version 1.0.0-bootstrap.0
```

6. Publish the bootstrap cohort and attach trust with the authenticated maintainer account + 2FA:

```bash
npm run release:npm:bootstrap -- \
  release-artifacts \
  --version 1.0.0-bootstrap.0 \
  --publish \
  --trust
```

The helper refuses rc/stable versions, requires exactly 22 public StingJS packages with the canonical repository metadata, publishes only under the `bootstrap` dist-tag, makes interrupted bootstrap publication resumable, refuses to overwrite a mismatched trusted publisher, verifies trust after each package, and waits two seconds between trust writes.

After trust is configured, prepare the real `1.0.0-rc.1` cohort on `dev`, pass the exact-head gates, promote it unchanged to `main`, and run `release.yml` with npm publication enabled. That is the **first publication of `1.0.0-rc.1`**, and it must happen through OIDC under `next`.

The registry bootstrap/OIDC proof is tracked by #135. The repository's `scripts/check-public-packages.mjs` prevents package version, visibility, repository identity, and internal-dependency drift.

## Trusted-publisher configuration

The guarded helper configures each public package with the equivalent of:

```bash
npm trust github <package> \
  --repo chrisbirster/stingjs \
  --file release.yml \
  --allow-publish \
  --yes
```

npm requires account-level 2FA for trust configuration. For bulk configuration, npm recommends a short delay between requests to avoid rate limiting. Verify individual package state with:

```bash
npm trust list <package>
```

## Release workflow

Run **Release** manually from `main` on the exact promoted release commit and provide a tag equal to `v` plus the committed root package version.

The workflow:

- runs the software and package-release gates;
- builds Android release artifacts and proves the prebuilt host works without Zig;
- builds/tests the production iOS host and proves the distributable host works without Zig;
- packages the Sting Go Android developer-client APK and iOS Simulator developer-client ZIP, with SHA-256 metadata, into the same release bundle;
- packs every public SDK/CLI package;
- builds the `create-sting` tarball with the real Android/iOS native host artifacts embedded;
- optionally publishes the 22-package npm train in dependency order using OIDC;
- creates a GitHub prerelease or stable release from the exact commit.

For the one-time bootstrap cohort, leave **Publish npm packages** disabled and use the guarded local bootstrap helper on the resulting tarballs. For the real RC and stable releases, enable npm publication so the release workflow performs the publish through OIDC.

## 1.0 RC promotion

The concrete first-RC checklist lives in [`release-candidate-1.0.0-rc.1.md`](release-candidate-1.0.0-rc.1.md). A release candidate may be used to finish independent-consumer and registry validation, but stable 1.0 cannot bypass the explicit final gates.

Before stable 1.0:

- #134 must prove a genuinely independent external repository can consume the RC with no Sting source checkout or local/file dependencies;
- #135 must prove the normal npm package train publishes through trusted OIDC after bootstrap;
- #5 must contain same-device physical Android Sting/official-QuickJS vs React Native/Hermes release evidence;
- #70 must have no remaining 1.0 release blockers.

Current npm trusted-publishing documentation: https://docs.npmjs.com/trusted-publishers/
