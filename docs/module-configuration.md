# Sting module permission configuration

`sting-module.json` is the source of truth for native permissions required by a Sting module. Static host configuration is generated from those declarations; module packages must not require applications to hand-copy permission entries into Android manifests or iOS configuration.

This capability is intentionally separate from runtime user-consent APIs. Declaring a permission makes the native host capable of using an API. It does **not** request permission from the user, report authorization state, or define when an application should prompt.

## Schema-v1 declarations

Android permissions are fully qualified manifest permission names:

```json
{
  "android": {
    "module": "run.stingjs.modules.haptics.HapticsModule",
    "permissions": ["android.permission.VIBRATE"]
  }
}
```

The generator emits these as deterministic `<uses-permission>` entries. Multiple modules may declare the same permission; the generated host plan contains it once.

iOS permission declarations are required Info.plist usage-description keys:

```json
{
  "ios": {
    "module": "LocationModule",
    "permissions": ["NSLocationWhenInUseUsageDescription"]
  }
}
```

A module declares **which** usage-description keys are required, not the final user-facing sentence. The application owns that copy because it must accurately describe how that particular application uses the capability. Sting therefore generates an Info.plist requirements input rather than inventing or embedding module-authored permission prose.

Schema v1 remains backward compatible: `ios.permissions` and `android.permissions` are still arrays of strings. Validation now constrains Android entries to qualified identifiers and iOS entries to `NS…UsageDescription` keys.

## Generate the host configuration plan

Run:

```bash
npm run modules:config
```

By default Sting writes:

```text
generated/sting-modules/
  sting-modules.config.json
  android/AndroidManifest.permissions.xml
  ios/InfoPlist.permissions.json
```

Use a different destination when integrating with another build directory:

```bash
node scripts/sting-module-config.mjs --output path/to/generated
```

`sting-modules.config.json` is the canonical cross-platform plan. Its module list is sorted by package name, Android permissions are sorted and deduplicated, and iOS requirements are sorted and deduplicated. The two platform files are deterministic renderings of that plan.

Example plan:

```json
{
  "schemaVersion": 1,
  "modules": [
    { "package": "@stingjs/haptics", "version": "0.1.0" }
  ],
  "android": {
    "permissions": ["android.permission.VIBRATE"]
  },
  "ios": {
    "requiredInfoPlistKeys": []
  }
}
```

The Android XML is suitable for manifest merging or generated-host composition. The iOS JSON is intentionally a requirements file: later host/autolinking tooling combines those required keys with application-owned usage-description values before producing the final Info.plist configuration.

## Validation and conflicts

`npm run modules:validate` validates platform permission syntax through the same shared implementation used by the generator. Root `npm test` also exercises deterministic ordering, deduplication, malformed declarations, conflict handling, platform rendering, and the current first-party manifest set.

Repeated declarations of the same platform permission are safe and collapse to one generated entry. Repeated copies of the exact same package/configuration are also harmless. If two discovered copies of the same package disagree on version or permission declarations, generation fails instead of choosing one silently. This prevents dependency resolution from producing an ambiguous native host configuration.

## Static declaration versus runtime permission APIs

These are separate responsibilities:

1. **Static declaration/configuration** — this capability. `sting-module.json` declares required platform metadata and Sting produces deterministic host configuration inputs.
2. **Runtime authorization** — later shared Modules SDK work. A permission-aware module may need APIs for current status, requesting consent, and reacting to authorization changes.

Static generation must not simulate runtime consent. Runtime permission APIs must not modify the native application manifest or Info.plist after the application has been built.

This separation lets modules such as Haptics declare install-time permissions today while future modules such as Location, Camera, Notifications, or Contacts can reuse the same generated host configuration before adding shared runtime authorization behavior.
