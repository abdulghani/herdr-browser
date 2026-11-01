#!/usr/bin/env bash
# Make build/icon.iconset (the app icon sizes macOS wants) from build/icon.png, for the
# Electrobun build (electrobun.config.ts). Needs macOS (sips). Skipped when it is up to date.
set -euo pipefail

cd "$(dirname "$0")/.."
src=build/icon.png
out=build/icon.iconset

if [[ -d "$out" && "$out" -nt "$src" ]]; then exit 0; fi
rm -rf "$out"
mkdir -p "$out"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$src" --out "$out/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$src" --out "$out/icon_${size}x${size}@2x.png" >/dev/null
done
