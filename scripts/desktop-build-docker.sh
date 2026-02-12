#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[desktop] building Tauri app in Docker..."
docker compose run --rm --profile desktop-build desktop-builder

echo "[desktop] build done. Bundles are in:"
echo "  $ROOT_DIR/desktop/src-tauri/target/release/bundle"
