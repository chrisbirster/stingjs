# Scenario ownership

Do not add scenarios directly to this directory root.

Each parallel workstream owns one child directory named after its `workstream` id from `workstreams.json` and exports `scenario` from `index.tsx`.

The shared harness discovers those entry points automatically at build time. This is deliberate: child branches should not edit a central registry and therefore should merge cleanly into the integration branch.
