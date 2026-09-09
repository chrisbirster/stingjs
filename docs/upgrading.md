# Upgrading StingJS applications

Until StingJS has a dedicated `sting upgrade` command, upgrades are intentionally explicit.

1. Read the target release notes and this document before changing versions.
2. Move all first-party `@stingjs/*` dependencies to the same target version.
3. Keep `@stingjs/cli` aligned with the application SDK release.
4. Run `npm install`, then `sting doctor`, `sting test`, and `sting ci`.
5. Generate a scratch application with the target `create-sting` version and compare its `sting.config.ts`, iOS project, Android project, and package scripts with the application being upgraded.
6. Apply documented native/config migrations rather than replacing a real application's native project wholesale.
7. Run `sting run ios` and `sting run android` on representative devices before shipping.

For a patch or minor release after 1.0, existing documented public APIs should remain source-compatible unless the release notes explicitly describe a security or correctness exception. Major releases may require migrations and will document them in the changelog.

Do not add Zig to an ordinary application's toolchain as part of an upgrade. Published Sting applications consume distributable native host artifacts; Zig remains a Sting runtime/source-build concern.
