#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT_DIR/desktop/src-tauri/target/release/bundle/macos/PrivateChat Desktop.app}"
IDENTITY="${APPLE_DEVELOPER_IDENTITY:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[sign] macOS only"
  exit 1
fi

if [[ -z "$IDENTITY" ]]; then
  echo "[sign] Set APPLE_DEVELOPER_IDENTITY, e.g."
  echo "  export APPLE_DEVELOPER_IDENTITY='Developer ID Application: Your Name (TEAMID)'"
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "[sign] App bundle not found: $APP_PATH"
  exit 1
fi

echo "[sign] Signing: $APP_PATH"
codesign --deep --force --verify --verbose \
  --sign "$IDENTITY" \
  --options runtime \
  "$APP_PATH"

codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl -a -t exec -vv "$APP_PATH" || true

echo "[sign] Done."
