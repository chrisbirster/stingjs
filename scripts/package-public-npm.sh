#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-$REPO_ROOT/release-artifacts}"
if [[ "$ARTIFACT_DIR" != /* ]]; then ARTIFACT_DIR="$REPO_ROOT/$ARTIFACT_DIR"; fi
mkdir -p "$ARTIFACT_DIR"
ORDER_FILE="$ARTIFACT_DIR/npm-publish-order.txt"
: > "$ORDER_FILE"

cd "$REPO_ROOT"
npm run release:check:packages

package_roots=(
  packages/core
  packages/solid
  packages/modules-core
  packages/native
  packages/stylex
  packages/modules/haptics
  packages/modules/clipboard
  packages/modules/device
  packages/modules/filesystem
  packages/modules/secure-store
  packages/modules/network
  packages/modules/sharing
  packages/modules/sensors
  packages/modules/image-picker
  packages/modules/location
  packages/modules/contacts
  packages/modules/camera
  packages/modules/notifications
  packages/modules/audio
  packages/modules/background-task
  tooling/cli
)

for package_root in "${package_roots[@]}"; do
  json_file="$(mktemp)"
  (cd "$package_root" && npm pack --pack-destination "$ARTIFACT_DIR" --json > "$json_file")
  filename="$(node - "$json_file" <<'NODE'
const fs = require('node:fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const entries = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
if (entries.length !== 1 || !entries[0]?.filename) throw new Error('npm pack did not return exactly one tarball');
process.stdout.write(entries[0].filename);
NODE
)"
  rm -f "$json_file"
  test -f "$ARTIFACT_DIR/$filename"
  printf '%s\n' "$filename" >> "$ORDER_FILE"
done

count="$(wc -l < "$ORDER_FILE" | tr -d ' ')"
if [[ "$count" != "21" ]]; then
  echo "error: expected 21 SDK/CLI tarballs, got $count" >&2
  exit 1
fi
printf 'packaged %s public SDK/CLI tarballs\n' "$count"
